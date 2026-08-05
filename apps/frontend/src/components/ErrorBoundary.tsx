import React, { Component, ErrorInfo, ReactNode } from "react";
import { withTranslation, WithTranslation } from "react-i18next";
import * as Sentry from "@sentry/react";
import { logClientError } from "../lib/clientLogger";

interface Props extends WithTranslation {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    logClientError(error, {
      type: "react_error_boundary",
      componentStack: errorInfo.componentStack,
    });
    Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo.componentStack } },
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="glass-panel rounded-[1.5rem] p-10 flex flex-col items-center justify-center gap-4 text-center min-h-[240px]">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-destructive"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-display font-bold text-foreground">
              {this.props.t("auto.somethingWentWrong", "Something went wrong")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {this.props.t(
                "auto.anUnexpectedErrorOccurredInThisPan",
                "An unexpected error occurred in this panel.",
              )}
            </p>
            {this.state.error && (
              <p className="mt-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg font-mono">
                {this.state.error.message}
              </p>
            )}
          </div>
          <button
            onClick={this.handleRetry}
            className="brand-cta text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-opacity hover:opacity-90"
          >
            {this.props.t("auto.tryAgain", "Try Again")}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default withTranslation()(ErrorBoundary);
