/**
 * Simple logging utility for consistent error and info logging
 */

const error = (message, exception = null) => {
  console.error(
    `[ERROR] ${message}`,
    exception ? `: ${exception.message}` : "",
  );
  if (exception && exception.stack) {
    console.error(exception.stack);
  }
};

const warn = (message, context = null) => {
  console.warn(
    `[WARN] ${message}`,
    context ? `- ${JSON.stringify(context)}` : "",
  );
};

const info = (message, context = null) => {
  console.log(
    `[INFO] ${message}`,
    context ? `- ${JSON.stringify(context)}` : "",
  );
};

const debug = (message, context = null) => {
  if (process.env.DEBUG_MODE === "true") {
    console.debug(
      `[DEBUG] ${message}`,
      context ? `- ${JSON.stringify(context)}` : "",
    );
  }
};

module.exports = {
  error,
  warn,
  info,
  debug,
};
