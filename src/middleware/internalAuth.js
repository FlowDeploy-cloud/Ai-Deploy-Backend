const authenticateInternal = (req, res, next) => {
    const headerToken = req.headers['x-internal-token'];
    const expectedToken = process.env.INTERNAL_AUTOMATION_TOKEN;

    if (!expectedToken) {
        return res.status(500).json({
            success: false,
            error: 'Internal automation token is not configured'
        });
    }

    if (!headerToken || headerToken !== expectedToken) {
        return res.status(401).json({
            success: false,
            error: 'Invalid internal automation token'
        });
    }

    next();
};

module.exports = {
    authenticateInternal
};
