const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Ubiquitous Communication Platform API',
      version: '1.0.0',
      description: 'Documentação automática gerada para a API'
    },
    servers: [
      { url: '/api', description: 'API Base' }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            username: { type: 'string', example: 'john_doe' },
            is_online: { type: 'boolean', example: true },
            last_seen: { type: 'string', format: 'date-time', nullable: true }
          }
        },
        AuthRequest: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string', example: 'john_doe' },
            password: { type: 'string', example: 'securepassword123' }
          }
        },
        AuthResponse: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            username: { type: 'string', example: 'john_doe' },
            token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }
          }
        },
        Conversation: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'Group Chat', nullable: true },
            type: { type: 'string', enum: ['private', 'group'], example: 'private' },
            created_at: { type: 'string', format: 'date-time', example: '2025-12-09T10:00:00Z' }
          }
        },
        ConversationRequest: {
          type: 'object',
          required: ['participants'],
          properties: {
            participants: { 
              type: 'array', 
              items: { type: 'string' },
              example: ['john_doe', 'jane_smith']
            },
            type: { 
              type: 'string', 
              enum: ['private', 'group'], 
              example: 'private',
              default: 'private'
            }
          }
        },
        Message: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            conversation_id: { type: 'integer', example: 1 },
            sender_username: { type: 'string', example: 'john_doe' },
            content: { type: 'string', example: 'Hello there!' },
            type: { type: 'string', enum: ['text', 'file'], example: 'text' },
            file_id: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['SENT', 'DELIVERED', 'READ'], example: 'SENT' },
            created_at: { type: 'string', format: 'date-time', example: '2025-12-09T10:05:00Z' },
            updated_at: { type: 'string', format: 'date-time', nullable: true }
          }
        },
        MessageRequest: {
          type: 'object',
          required: ['conversationId'],
          properties: {
            conversationId: { type: 'integer', example: 1 },
            content: { type: 'string', example: 'Hello there!' },
            type: { 
              type: 'string', 
              enum: ['text', 'file'], 
              example: 'text',
              default: 'text'
            },
            file_id: { type: 'string', example: 'file-uuid-123', nullable: true }
          }
        },
        PresenceRequest: {
          type: 'object',
          required: ['is_online'],
          properties: {
            is_online: { type: 'boolean', example: true }
          }
        },
        PresenceResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean', example: true },
            status: { type: 'string', example: 'online' }
          }
        },
        PendingMessage: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            recipient_username: { type: 'string', example: 'jane_smith' },
            sender_username: { type: 'string', example: 'john_doe' },
            conversation_id: { type: 'integer', example: 1 },
            content: { type: 'string', example: 'Are you there?' },
            delivered: { type: 'boolean', example: false }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Invalid request' }
          }
        }
      }
    },
    security: [{ BearerAuth: [] }]
  },
  apis: ['./src/routes.js']
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
