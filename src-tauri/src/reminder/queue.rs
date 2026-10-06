use std::cmp::{Ordering, Reverse};
use std::collections::{BinaryHeap, HashMap};
use std::time::{SystemTime, UNIX_EPOCH};

use super::{Job, NoticeJob, ReminderJob};

/// Jobs that fired but were never stopped or snoozed are pruned after this long,
/// so a long-running session cannot accumulate them forever.
const RINGING_TTL_MS: i64 = 24 * 60 * 60 * 1000;

/// A repeat whose slot already passed (long sleep, suspended machine) rings this
/// far out instead of immediately replaying the whole backlog.
const REPEAT_CATCHUP_MS: i64 = 60 * 1000;

/// Wall-clock milliseconds since the Unix epoch. Read fresh on every wake-up:
/// `Condvar::wait_timeout` is measured against a monotonic clock that does not
/// advance while the machine is suspended, so its elapsed time cannot be trusted.
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}

pub struct Entry {
    trigger_at: i64,
    seq: u64,
    job: Job,
}

// Ordered by due time, with the insertion counter breaking ties so two jobs due
// in the same millisecond keep a stable order.
impl Ord for Entry {
    fn cmp(&self, other: &Self) -> Ordering {
        self.trigger_at
            .cmp(&other.trigger_at)
            .then(self.seq.cmp(&other.seq))
    }
}

impl PartialOrd for Entry {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl PartialEq for Entry {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other) == Ordering::Equal
    }
}

impl Eq for Entry {}

#[derive(Default)]
pub struct Queue {
    // `Reverse` turns the max-heap into the min-heap we want: earliest job first.
    entries: BinaryHeap<Reverse<Entry>>,
    ringing: HashMap<String, ReminderJob>,
    seq: u64,
    inapp_fallback: bool,
    stopped: bool,
}

impl Queue {
    pub fn inapp_fallback(&self) -> bool {
        self.inapp_fallback
    }

    pub fn set_inapp_fallback(&mut self, fallback: bool) {
        self.inapp_fallback = fallback;
    }

    pub fn is_stopped(&self) -> bool {
        self.stopped
    }

    pub fn stop_worker(&mut self) {
        self.stopped = true;
    }

    fn push(&mut self, job: Job) {
        self.seq += 1;
        self.entries.push(Reverse(Entry {
            trigger_at: job.trigger_at(),
            seq: self.seq,
            job,
        }));
    }

    fn retain(&mut self, keep: impl Fn(&Job) -> bool) {
        let kept: Vec<Reverse<Entry>> = std::mem::take(&mut self.entries)
            .into_iter()
            .filter(|Reverse(entry)| keep(&entry.job))
            .collect();
        self.entries = kept.into_iter().collect();
    }

    /// Replaces every reminder, leaving scheduled notices untouched. The two
    /// kinds are synced by different widget windows, so neither may clobber the
    /// other's plan.
    pub fn replace_reminders(&mut self, jobs: Vec<ReminderJob>) {
        self.retain(|job| matches!(job, Job::Notice(_)));
        let cutoff = now_ms() - RINGING_TTL_MS;
        self.ringing.retain(|_, job| job.trigger_at >= cutoff);
        for job in jobs {
            self.push(Job::Reminder(job));
        }
    }

    pub fn replace_notices(&mut self, jobs: Vec<NoticeJob>) {
        self.retain(|job| matches!(job, Job::Reminder(_)));
        for job in jobs {
            self.push(Job::Notice(job));
        }
    }

    /// Stops one reminder, or every reminder that is currently ringing when
    /// `id` is `None`. Pending repeats of those reminders are dropped too;
    /// unrelated future reminders stay scheduled.
    pub fn stop(&mut self, id: Option<&str>) {
        match id {
            Some(id) => {
                self.ringing.remove(id);
                self.retain(|job| !matches!(job, Job::Reminder(job) if job.id == id));
            }
            None => {
                let ids: Vec<String> = self.ringing.keys().cloned().collect();
                self.ringing.clear();
                self.retain(|job| !matches!(job, Job::Reminder(job) if ids.contains(&job.id)));
            }
        }
    }

    pub fn snooze(&mut self, id: &str, minutes: u32) -> bool {
        let Some(mut job) = self.ringing.remove(id) else {
            return false;
        };

        self.retain(|job| !matches!(job, Job::Reminder(job) if job.id == id));
        job.trigger_at = now_ms() + i64::from(minutes) * 60_000;
        job.round = 0;
        job.overdue_minutes = 0;
        self.push(Job::Reminder(job));
        true
    }

    /// Records a reminder as ringing and queues its next repeat, if any.
    pub fn after_fire(&mut self, job: ReminderJob) {
        let repeats =
            job.repeat_every_min > 0 && (job.repeat_max == 0 || job.round + 1 < job.repeat_max);

        if repeats {
            let mut next = job.clone();
            next.round += 1;
            next.trigger_at = job.trigger_at + i64::from(job.repeat_every_min) * 60_000;
            let now = now_ms();
            if next.trigger_at <= now {
                next.trigger_at = now + REPEAT_CATCHUP_MS;
            }
            self.push(Job::Reminder(next));
        }

        self.ringing.insert(job.id.clone(), job);
    }

    pub fn take_due(&mut self, now: i64) -> Vec<Job> {
        let mut due = Vec::new();
        while self
            .entries
            .peek()
            .is_some_and(|Reverse(entry)| entry.trigger_at <= now)
        {
            if let Some(Reverse(entry)) = self.entries.pop() {
                due.push(entry.job);
            }
        }
        due
    }

    pub fn next_trigger(&self) -> Option<i64> {
        self.entries.peek().map(|Reverse(entry)| entry.trigger_at)
    }

    pub fn queued(&self) -> usize {
        self.entries.len()
    }

    pub fn ringing(&self) -> usize {
        self.ringing.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reminder(id: &str, trigger_at: i64) -> ReminderJob {
        ReminderJob {
            id: id.to_owned(),
            item_id: id.to_owned(),
            title: "test".to_owned(),
            time_label: "09:00".to_owned(),
            tag: None,
            trigger_at,
            channel: "desktop".to_owned(),
            topmost: true,
            focus: false,
            visual: "breathe".to_owned(),
            repeat_every_min: 0,
            repeat_max: 0,
            auto_dismiss_sec: 0,
            overdue_minutes: 0,
            round: 0,
        }
    }

    fn notice(id: &str, trigger_at: i64) -> NoticeJob {
        NoticeJob {
            id: id.to_owned(),
            trigger_at,
            title: "notice".to_owned(),
            body: "body".to_owned(),
        }
    }

    #[test]
    fn returns_due_jobs_in_time_order() {
        let mut queue = Queue::default();
        queue.replace_reminders(vec![reminder("b", 200), reminder("a", 100)]);

        let due = queue.take_due(300);

        let ids: Vec<String> = due
            .iter()
            .map(|job| match job {
                Job::Reminder(job) => job.id.clone(),
                Job::Notice(job) => job.id.clone(),
            })
            .collect();
        assert_eq!(ids, vec!["a".to_owned(), "b".to_owned()]);
    }

    #[test]
    fn leaves_future_jobs_queued() {
        let mut queue = Queue::default();
        queue.replace_reminders(vec![reminder("a", 100), reminder("b", 5_000)]);

        assert_eq!(queue.take_due(1_000).len(), 1);
        assert_eq!(queue.next_trigger(), Some(5_000));
    }

    #[test]
    fn syncing_reminders_keeps_notices() {
        let mut queue = Queue::default();
        queue.replace_notices(vec![notice("hourly", 1_000)]);
        queue.replace_reminders(vec![reminder("a", 500)]);

        assert_eq!(queue.take_due(2_000).len(), 2);
    }

    #[test]
    fn syncing_notices_keeps_reminders() {
        let mut queue = Queue::default();
        queue.replace_reminders(vec![reminder("a", 500)]);
        queue.replace_notices(vec![notice("hourly", 1_000)]);

        assert_eq!(queue.take_due(2_000).len(), 2);
    }

    #[test]
    fn repeats_until_the_round_cap_is_reached() {
        let mut queue = Queue::default();
        let mut job = reminder("a", 0);
        job.repeat_every_min = 5;
        job.repeat_max = 3;

        // Round 0 and 1 each queue a follow-up; round 2 is the third and last ring.
        for round in 0..3 {
            let mut current = job.clone();
            current.round = round;
            queue.after_fire(current);
        }

        assert_eq!(queue.take_due(i64::MAX).len(), 2);
    }

    #[test]
    fn stopping_a_reminder_drops_its_pending_repeat() {
        let mut queue = Queue::default();
        let mut job = reminder("a", 0);
        job.repeat_every_min = 5;
        job.repeat_max = 0;
        queue.after_fire(job);

        queue.stop(Some("a"));

        assert!(queue.take_due(i64::MAX).is_empty());
    }

    #[test]
    fn stopping_everything_spares_reminders_that_are_not_ringing() {
        let mut queue = Queue::default();
        queue.replace_reminders(vec![reminder("future", 9_000)]);
        let mut ringing = reminder("ringing", 0);
        ringing.repeat_every_min = 5;
        queue.after_fire(ringing);

        queue.stop(None);

        let remaining = queue.take_due(i64::MAX);
        assert_eq!(remaining.len(), 1);
        assert!(matches!(&remaining[0], Job::Reminder(job) if job.id == "future"));
    }

    #[test]
    fn snoozing_requeues_a_ringing_reminder() {
        let mut queue = Queue::default();
        queue.after_fire(reminder("a", 0));

        assert!(queue.snooze("a", 5));

        let next = queue.next_trigger().expect("snoozed job should be queued");
        assert!(next > now_ms());
    }

    #[test]
    fn snoozing_an_unknown_reminder_reports_failure() {
        let mut queue = Queue::default();

        assert!(!queue.snooze("missing", 5));
    }
}
