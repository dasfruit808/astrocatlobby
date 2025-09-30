/**
 * Configure the AstroCats leaderboard API endpoint.
 *
 * By default the mini game runs without a remote leaderboard to avoid
 * development errors when the production API is unavailable. Supply the base
 * URL for your deployment by editing the `configuredBaseUrl` value below or by
 * replacing this helper with your own loader.
 */
(function configureLeaderboardApiBase() {
  if (typeof window === "undefined") {
    return;
  }

  /**
   * Set this to the base URL that hosts the leaderboard API. Example:
   *   const configuredBaseUrl = "https://your-domain.example.com";
   */
  var configuredBaseUrl = "";

  if (typeof configuredBaseUrl === "string") {
    configuredBaseUrl = configuredBaseUrl.trim();
  }

  if (!configuredBaseUrl) {
    return;
  }

  window.NYAN_ESCAPE_API_BASE_URL = configuredBaseUrl;
})();
