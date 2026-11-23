module.exports = {
  apps: [
    {
      name: "wa-akg-business-backend",
      cwd: "/home/aditya/project/WA-AKG-business/backend",
      script: "dist/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "250M",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "wa-akg-business-frontend",
      cwd: "/home/aditya/project/WA-AKG-business/frontend",
      script: ".next/standalone/server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "250M",
      env: {
        NODE_ENV: "production",
        PORT: 4041,
        BACKEND_URL: "http://127.0.0.1:4005",
      },
    },
  ],
};
