; Stop the service before an upgrade replaces its executables.
!macro NSIS_HOOK_PREINSTALL
  nsExec::ExecToLog 'sc.exe stop DeskTimeService'
!macroend

; The installer already runs elevated, so service registration needs no second
; UAC prompt. DTSvc registers/starts the fixed infrastructure after files exist.
!macro NSIS_HOOK_POSTINSTALL
  nsExec::ExecToLog '\"$INSTDIR\DTSvc.exe\" --install'
!macroend

; Uninstall has to take the service with it.
;
; A service is registered by absolute path. Removing the executable while its
; registration survives leaves Windows starting a file that is not there on every
; boot — visible only as an error in the event log, and impossible for the user
; to clear from any DeskTime UI, because there is no longer a DeskTime.
;
; Stop before delete: deleting a running service marks it for deletion and leaves
; it running until the next reboot.
!macro NSIS_HOOK_PREUNINSTALL
  nsExec::ExecToLog 'sc.exe stop DeskTimeService'
  nsExec::ExecToLog 'sc.exe delete DeskTimeService'
!macroend
