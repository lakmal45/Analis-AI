import React from "react";
import GlassCard from "./GlassCard";

/**
 * ErrorMessage - Reusable error display component
 * Handles different error types and provides retry functionality
 */
const ErrorMessage = ({
  title = "Something went wrong",
  message = "An error occurred. Please try again.",
  onRetry = null,
  showDetails = false,
  error = null,
  type = "error", // error, warning, info
}) => {
  const [showFullDetails, setShowFullDetails] = React.useState(false);

  const getIcon = () => {
    switch (type) {
      case "warning":
        return "⚠️";
      case "info":
        return "ℹ️";
      case "error":
      default:
        return "❌";
    }
  };

  const getBorderColor = () => {
    switch (type) {
      case "warning":
        return "border-yellow-400/30";
      case "info":
        return "border-blue-400/30";
      case "error":
      default:
        return "border-red-400/30";
    }
  };

  const getBgColor = () => {
    switch (type) {
      case "warning":
        return "bg-yellow-400/10";
      case "info":
        return "bg-blue-400/10";
      case "error":
      default:
        return "bg-red-400/10";
    }
  };

  return (
    <GlassCard
      className={`p-6 ${getBorderColor()} ${getBgColor()} animate-fadeIn`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{getIcon()}</span>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
          <p className="text-gray-300 mb-4">{message}</p>

          {/* Error Details (collapsible) */}
          {error && showDetails && (
            <div className="mb-4 p-3 bg-black/30 rounded-lg">
              <button
                onClick={() => setShowFullDetails(!showFullDetails)}
                className="text-sm text-gray-400 hover:text-white mb-2 flex items-center gap-1"
              >
                {showFullDetails ? "▼" : "▶"} Error Details
              </button>
              {showFullDetails && (
                <pre className="text-xs text-red-300 overflow-x-auto whitespace-pre-wrap">
                  {error.stack ||
                    error.message ||
                    JSON.stringify(error, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Try Again
              </button>
            )}
            {error && (
              <button
                onClick={() => setShowFullDetails(!showFullDetails)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {showFullDetails ? "Hide Details" : "Show Details"}
              </button>
            )}
          </div>
        </div>
      </div>
    </GlassCard>
  );
};

/**
 * NetworkError - Specific component for network-related errors
 */
export const NetworkError = ({ onRetry }) => (
  <ErrorMessage
    title="Network Error"
    message="Unable to connect to the server. Please check your internet connection and try again."
    onRetry={onRetry}
    type="error"
  />
);

/**
 * AuthError - Specific component for authentication errors
 */
export const AuthError = ({
  message = "Your session has expired. Please log in again.",
}) => (
  <ErrorMessage title="Authentication Error" message={message} type="error" />
);

/**
 * NotFoundError - Specific component for 404 errors
 */
export const NotFoundError = ({ resource = "Resource" }) => (
  <ErrorMessage
    title="Not Found"
    message={`The requested ${resource.toLowerCase()} could not be found.`}
    type="warning"
  />
);

/**
 * ValidationError - Specific component for form validation errors
 */
export const ValidationError = ({ errors = [] }) => (
  <GlassCard className="p-4 border-red-400/30 bg-red-400/10">
    <h4 className="text-red-400 font-semibold mb-2">⚠️ Validation Error</h4>
    <ul className="list-disc list-inside text-sm text-red-300 space-y-1">
      {errors.map((error, index) => (
        <li key={index}>{error}</li>
      ))}
    </ul>
  </GlassCard>
);

/**
 * APIErrorBoundary - Error boundary for API errors
 */
export class APIErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("API Error Boundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorMessage
          title="API Error"
          message="An error occurred while fetching data from the server."
          error={this.state.error}
          onRetry={() => {
            this.setState({ hasError: false, error: null });
            window.location.reload();
          }}
          showDetails={true}
          type="error"
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorMessage;
