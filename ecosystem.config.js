module.exports = {
  apps: [
    {
      name: "SchoolRyde Staging",
      script: "./server.js",
      watch: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
