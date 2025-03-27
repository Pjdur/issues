const config = {
    development: {
        port: 3000,
        staticDir: './public',
        issueDir: './issues'
    },
    production: {
        port: process.env.PORT || 3000,
        staticDir: './dist',
        issueDir: '/var/app/issues'
    }
};

module.exports = config;