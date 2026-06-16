#[derive(Clone, Copy, Debug)]
pub struct NoteLimits {
    pub total_uncompressed_bytes: u64,
    pub entry_bytes: u64,
    pub entries: usize,
    pub images: usize,
    pub compression_ratio: u64,
}

pub const NOTE_LIMITS: NoteLimits = NoteLimits {
    total_uncompressed_bytes: 256 * 1024 * 1024,
    entry_bytes: 64 * 1024 * 1024,
    entries: 1024,
    images: 200,
    compression_ratio: 100,
};
