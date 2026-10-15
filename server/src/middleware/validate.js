/**
 * Validates request body, query, or params against a Zod schema
 * @param {import('zod').ZodSchema} schema 
 * @param {'body' | 'query' | 'params'} [source='body']
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const formattedErrors = result.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message
      }));

      return res.status(400).json({
        success: false,
        error: {
          message: formattedErrors[0]?.message || 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: formattedErrors
        }
      });
    }

    // Assign sanitized / transformed data back to req
    req[source] = result.data;
    next();
  };
}
