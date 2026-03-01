module.exports = {
  apps: [{
    name:             'api-ircnl',
    script:           './worker.js',
    cwd:              '/opt/api-ircnl',
    instances:        1,
    exec_mode:        'fork',
    watch:            false,
    max_memory_restart: '400M',
    env: {
      NODE_ENV:   'production',
      TZ:         'America/Monterrey',
    },
    env_file:         '/opt/api-ircnl/.env',
    error_file:       '/var/log/api-ircnl/error.log',
    out_file:         '/var/log/api-ircnl/out.log',
    log_date_format:  'YYYY-MM-DD HH:mm:ss.SSS',
    merge_logs:       true,
    restart_delay:    5000,
    max_restarts:     10,
    autorestart:      true,
  }]
};
