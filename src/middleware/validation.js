const { body, param, validationResult } = require('express-validator');

// Validation error handler
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            errors: errors.array().map(err => ({
                field: err.param,
                message: err.msg
            }))
        });
    }
    
    next();
};

// User registration validation
const validateRegistration = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage('Username must be between 3 and 50 characters')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Username can only contain letters, numbers, underscores and hyphens'),
    
    body('email')
        .trim()
        .isEmail()
        .withMessage('Invalid email address')
        .normalizeEmail(),
    
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
    
    handleValidationErrors
];

// Login validation
const validateLogin = [
    body('email')
        .trim()
        .isEmail()
        .withMessage('Invalid email address')
        .normalizeEmail(),
    
    body('password')
        .notEmpty()
        .withMessage('Password is required'),
    
    handleValidationErrors
];

// Deployment validation
const validateDeployment = [
    body('name')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Name must be between 1 and 100 characters'),
    
    body('frontend_repo')
        .optional()
        .trim()
        .matches(/^https?:\/\/(www\.)?github\.com\/[\w-]+\/[\w.-]+/)
        .withMessage('Invalid GitHub repository URL'),
    
    body('backend_repo')
        .optional()
        .trim()
        .matches(/^https?:\/\/(www\.)?github\.com\/[\w-]+\/[\w.-]+/)
        .withMessage('Invalid GitHub repository URL'),
    
    body('frontend_description')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Frontend description must be less than 500 characters'),
    
    body('backend_description')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Backend description must be less than 500 characters'),
    
    body('custom_domain')
        .optional()
        .trim()
        .matches(/^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/)
        .withMessage('Invalid custom domain'),
    
    body('env_vars')
        .optional()
        .isObject()
        .withMessage('Environment variables must be an object'),
    
    // At least one repo is required
    body().custom((value, { req }) => {
        if (!req.body.frontend_repo && !req.body.backend_repo) {
            throw new Error('At least one repository (frontend or backend) is required');
        }
        return true;
    }),
    
    handleValidationErrors
];

// Deployment ID validation
const validateDeploymentId = [
    param('id')
        .trim()
        .notEmpty()
        .withMessage('Deployment ID is required'),
    
    handleValidationErrors
];

// Subdomain validation
const validateSubdomain = [
    body('subdomain')
        .trim()
        .matches(/^[a-z][a-z0-9-]{2,62}$/)
        .withMessage('Invalid subdomain format'),
    
    body('port')
        .isInt({ min: 1024, max: 65535 })
        .withMessage('Port must be between 1024 and 65535'),
    
    handleValidationErrors
];

module.exports = {
    handleValidationErrors,
    validateRegistration,
    validateLogin,
    validateDeployment,
    validateDeploymentId,
    validateSubdomain
};
