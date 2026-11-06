use serde_json::Value;

#[derive(Debug, Clone)]
pub struct ApiError {
    pub code: String,
    pub status: u16,
    pub message: String,
    pub issues: Vec<Value>,
    pub body: Option<Value>,
    pub current_revision: Option<i64>,
}
impl ApiError {
    pub fn new(code: impl Into<String>, status: u16) -> Self {
        let code = code.into();
        Self {
            message: code.clone(),
            code,
            status,
            issues: Vec::new(),
            body: None,
            current_revision: None,
        }
    }
    pub fn with_message(mut self, message: impl Into<String>) -> Self {
        self.message = message.into();
        self
    }
    pub fn with_issues(mut self, issues: Vec<Value>) -> Self {
        self.issues = issues;
        self
    }
    pub fn with_body(mut self, body: Value) -> Self {
        self.body = Some(body);
        self
    }
    pub fn with_revision(mut self, revision: i64) -> Self {
        self.current_revision = Some(revision);
        self
    }
}
impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.code)
    }
}
impl std::error::Error for ApiError {}
