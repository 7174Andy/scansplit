use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),

    #[error("migrate error: {0}")]
    Migrate(#[from] sqlx::migrate::MigrateError),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("keyring error: {0}")]
    Keyring(#[from] keyring::Error),

    #[error("api key missing — set it in Settings")]
    MissingApiKey,

    #[error("invalid api key (401)")]
    InvalidApiKey,

    #[error("rate limited after {0} attempts")]
    RateLimited(u32),

    #[error("ocr parse error: {0}")]
    OcrParse(String),

    #[error("unsupported image format: {0}")]
    UnsupportedImageFormat(String),

    #[error("not found")]
    NotFound,

    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut o = s.serialize_struct("AppError", 2)?;
        o.serialize_field("code", &error_code(self))?;
        o.serialize_field("message", &self.to_string())?;
        o.end()
    }
}

fn error_code(e: &AppError) -> &'static str {
    match e {
        AppError::Db(_) => "DB",
        AppError::Migrate(_) => "MIGRATE",
        AppError::Io(_) => "IO",
        AppError::Http(_) => "HTTP",
        AppError::Keyring(_) => "KEYRING",
        AppError::MissingApiKey => "MISSING_API_KEY",
        AppError::InvalidApiKey => "INVALID_API_KEY",
        AppError::RateLimited(_) => "RATE_LIMITED",
        AppError::OcrParse(_) => "OCR_PARSE",
        AppError::UnsupportedImageFormat(_) => "UNSUPPORTED_IMAGE_FORMAT",
        AppError::NotFound => "NOT_FOUND",
        AppError::Other(_) => "OTHER",
    }
}

pub type AppResult<T> = Result<T, AppError>;
