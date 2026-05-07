use crate::api::{ApiError, ApiErrorCode, ApiResult};

pub const PIPE_PREFIX: &str = r"\\.\pipe\DeskTime.Core";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EndpointIdentity {
    pub user_sid: String,
    pub session_id: u32,
}

impl EndpointIdentity {
    pub fn pipe_name(&self) -> ApiResult<String> {
        if self.user_sid.is_empty()
            || !self
                .user_sid
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || character == '-')
        {
            return Err(ApiError::new(
                ApiErrorCode::InvalidRequest,
                "user SID contains unsupported characters",
            ));
        }
        Ok(format!("{PIPE_PREFIX}.{}.{}", self.user_sid, self.session_id))
    }

    /// The pipe's access control, as SDDL.
    ///
    /// `P` blocks inheritance, so this list is the whole of it: LocalSystem
    /// (the service that starts DTCore) and this one user. Everyone else —
    /// including another interactive user on the same machine — is refused by
    /// the object manager before a single frame is read, which is why the
    /// protocol below never has to authenticate a caller.
    pub fn dacl(&self) -> String {
        format!("D:P(A;;GA;;;SY)(A;;GA;;;{})", self.user_sid)
    }
}

#[cfg(windows)]
impl EndpointIdentity {
    /// This process's own user and session.
    ///
    /// Both halves are needed. The SID keeps two users' endpoints apart; the
    /// session id keeps one user's console and RDP sessions apart, which is the
    /// case DTSvc creates by starting a DTCore per active session.
    pub fn current() -> ApiResult<Self> {
        use windows::Win32::Foundation::{CloseHandle, LocalFree, HANDLE, HLOCAL};
        use windows::Win32::Security::Authorization::ConvertSidToStringSidW;
        use windows::Win32::Security::{GetTokenInformation, TokenUser, TOKEN_QUERY, TOKEN_USER};
        use windows::Win32::System::RemoteDesktop::ProcessIdToSessionId;
        use windows::Win32::System::Threading::{
            GetCurrentProcess, GetCurrentProcessId, OpenProcessToken,
        };

        unsafe {
            let mut token = HANDLE::default();
            OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token)
                .map_err(|error| identity_error("open the process token", &error))?;

            // The first call fails with ERROR_INSUFFICIENT_BUFFER and fills in
            // the size; a SID is variable-length, so there is no struct to
            // allocate up front.
            let mut needed = 0u32;
            let _ = GetTokenInformation(token, TokenUser, None, 0, &mut needed);
            let mut buffer = vec![0u8; needed as usize];
            let queried = GetTokenInformation(
                token,
                TokenUser,
                Some(buffer.as_mut_ptr().cast()),
                needed,
                &mut needed,
            );
            let _ = CloseHandle(token);
            queried.map_err(|error| identity_error("read the token user", &error))?;

            let user = &*(buffer.as_ptr() as *const TOKEN_USER);
            let mut text = windows::core::PWSTR::null();
            ConvertSidToStringSidW(user.User.Sid, &mut text)
                .map_err(|error| identity_error("format the user SID", &error))?;
            let user_sid = text.to_string().unwrap_or_default();
            let _ = LocalFree(Some(HLOCAL(text.0.cast())));

            let mut session_id = 0u32;
            ProcessIdToSessionId(GetCurrentProcessId(), &mut session_id)
                .map_err(|error| identity_error("read the session id", &error))?;

            Ok(Self {
                user_sid,
                session_id,
            })
        }
    }
}

#[cfg(not(windows))]
impl EndpointIdentity {
    pub fn current() -> ApiResult<Self> {
        Err(ApiError::new(
            ApiErrorCode::CoreUnavailable,
            "the DTCore endpoint is Windows-only",
        ))
    }
}

#[cfg(windows)]
fn identity_error(action: &str, error: &windows::core::Error) -> ApiError {
    ApiError::new(
        ApiErrorCode::CoreUnavailable,
        format!("could not {action}: {error}"),
    )
}

#[cfg(test)]
mod tests {
    use super::EndpointIdentity;

    fn identity() -> EndpointIdentity {
        EndpointIdentity {
            user_sid: "S-1-5-21-1111111111-2222222222-3333333333-1001".to_owned(),
            session_id: 2,
        }
    }

    #[test]
    fn names_the_pipe_per_user_and_session() {
        assert_eq!(
            identity().pipe_name().unwrap(),
            r"\\.\pipe\DeskTime.Core.S-1-5-21-1111111111-2222222222-3333333333-1001.2"
        );
    }

    #[test]
    fn refuses_a_sid_that_could_escape_the_pipe_namespace() {
        let hostile = EndpointIdentity {
            user_sid: r"..\..\pipe\other".to_owned(),
            session_id: 1,
        };
        assert!(hostile.pipe_name().is_err());
    }

    #[test]
    fn grants_only_system_and_the_owning_user() {
        let dacl = identity().dacl();
        assert!(dacl.starts_with("D:P("), "inheritance must be blocked");
        assert_eq!(dacl.matches("(A;;GA;;;").count(), 2);
        assert!(dacl.contains("(A;;GA;;;SY)"));
        assert!(dacl.contains(&format!("(A;;GA;;;{})", identity().user_sid)));
    }
}
