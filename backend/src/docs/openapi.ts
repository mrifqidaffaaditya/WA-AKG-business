import { Router, Request, Response } from "express";

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "WA-AKG Business API",
    version: "3.5.0",
    description: `
**WA-AKG Business REST API & Webhook System**

A comprehensive, lightweight, and realtime WhatsApp automation platform for Customer Support, AI Chatbots, and CRM Integration.

### Key Features
- **Send & Broadcast**: Send single or bulk WhatsApp messages (text, image, video, document).
- **Conversations & History**: Access real-time conversations, thread transcripts, and customer profiles.
- **Webhooks**: Real-time event streaming with HMAC SHA-256 signatures and automatic retries.
- **Stock & Inventory**: Query and trigger real-time stock synchronizations.
- **Security**: Built-in rate limiting, constant-time token verification, and SSRF guardrails.

### Authentication
Authenticate requests using either:
1. **API Key Header**: \`X-API-Key: akg_live_...\`
2. **Bearer Token**: \`Authorization: Bearer akg_live_...\` (or JWT for CS/Admin users)
`,
    contact: {
      name: "WA-AKG Business Engineering",
      url: "https://github.com/mrifqidaffaaditya/WA-AKG-business",
    },
  },
  servers: [
    {
      url: "/api",
      description: "Default API Gateway",
    },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "API Key generated from the Admin Developer Dashboard",
      },
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT or API Key",
        description: "Bearer authentication token",
      },
    },
    schemas: {
      SendMessageRequest: {
        type: "object",
        required: ["to"],
        properties: {
          to: {
            type: "string",
            description: "Target phone number (e.g., '081234567890' or '6281234567890') or WhatsApp JID",
            example: "6281234567890",
          },
          content: {
            type: "string",
            description: "Text message or media caption",
            example: "Halo, pesanan Anda #12345 sudah dikirim!",
          },
          contentType: {
            type: "string",
            enum: ["text", "image", "video", "document"],
            default: "text",
            example: "text",
          },
          mediaUrl: {
            type: "string",
            description: "Direct URL of image, video, or document to send",
            example: "https://example.com/receipt.pdf",
          },
          fileName: {
            type: "string",
            description: "File name when sending documents",
            example: "receipt.pdf",
          },
        },
      },
      BroadcastRequest: {
        type: "object",
        required: ["recipients", "content"],
        properties: {
          recipients: {
            type: "array",
            items: { type: "string" },
            description: "Array of recipient phone numbers (up to 500)",
            example: ["6281234567890", "6289876543210"],
          },
          content: {
            type: "string",
            description: "Broadcast message text",
            example: "Promo Hari Ini: Diskon 20% untuk semua produk!",
          },
          delayMs: {
            type: "integer",
            default: 800,
            description: "Stagger delay between messages in milliseconds to avoid WhatsApp ban",
          },
        },
      },
      Conversation: {
        type: "object",
        properties: {
          id: { type: "string" },
          wa_number: { type: "string" },
          customer_name: { type: "string", nullable: true },
          status: { type: "string", enum: ["bot", "waiting", "active", "resolved", "hold"] },
          claimed_by: { type: "string", nullable: true },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      Webhook: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          url: { type: "string" },
          secret: { type: "string" },
          events: { type: "array", items: { type: "string" } },
          isActive: { type: "boolean" },
          createdAt: { type: "string" },
        },
      },
      WebhookDelivery: {
        type: "object",
        properties: {
          id: { type: "string" },
          webhookId: { type: "string" },
          event: { type: "string" },
          url: { type: "string" },
          responseStatus: { type: "integer", nullable: true },
          durationMs: { type: "integer" },
          success: { type: "boolean" },
          errorMessage: { type: "string", nullable: true },
          attempt: { type: "integer" },
          createdAt: { type: "string" },
        },
      },
    },
  },
  security: [
    { ApiKeyAuth: [] },
    { BearerAuth: [] },
  ],
  paths: {
    "/v1/messages/send": {
      post: {
        summary: "Send WhatsApp Message",
        description: "Send a text, image, video, or document message to any WhatsApp phone number.",
        tags: ["Messages"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SendMessageRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Message delivered to WhatsApp Gateway",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    messageId: { type: "string", example: "msg_xyz123" },
                    conversationId: { type: "string", example: "conv_abc789" },
                    waMessageId: { type: "string", example: "3EB0B0F39D5" },
                    to: { type: "string", example: "6281234567890" },
                    sentAt: { type: "string", example: "2026-11-23T12:00:00.000Z" },
                  },
                },
              },
            },
          },
          400: { description: "Invalid parameters or phone number" },
          401: { description: "Unauthorized or missing API key" },
        },
      },
    },
    "/v1/messages/broadcast": {
      post: {
        summary: "Broadcast WhatsApp Messages",
        description: "Queue bulk WhatsApp messages to multiple recipients with safe staggered delivery.",
        tags: ["Messages"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BroadcastRequest" },
            },
          },
        },
        responses: {
          202: {
            description: "Broadcast queued for delivery",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    queued: { type: "integer", example: 150 },
                    staggerDelayMs: { type: "integer", example: 800 },
                    estimatedDurationSeconds: { type: "integer", example: 120 },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/v1/conversations": {
      get: {
        summary: "List Conversations",
        description: "Retrieve paginated list of conversations with status and keyword filters.",
        tags: ["Conversations"],
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["bot", "waiting", "active", "resolved", "hold"] } },
          { name: "search", in: "query", schema: { type: "string" }, description: "Filter by customer name or phone" },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "cursor", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "List of conversations",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    conversations: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Conversation" },
                    },
                    nextCursor: { type: "string", nullable: true },
                    hasMore: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/v1/conversations/{id}": {
      get: {
        summary: "Get Conversation",
        description: "Retrieve a conversation with metadata and recent messages.",
        tags: ["Conversations"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Conversation found" },
          404: { description: "Conversation not found" },
        },
      },
    },
    "/v1/conversations/{id}/messages": {
      get: {
        summary: "Get Conversation Messages",
        description: "Retrieve message history for a conversation.",
        tags: ["Conversations"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 30 } },
          { name: "cursor", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Message history" },
        },
      },
      post: {
        summary: "Reply to Conversation",
        description: "Post a message into an existing conversation thread.",
        tags: ["Conversations"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  content: { type: "string" },
                  contentType: { type: "string", enum: ["text", "image", "video", "document"] },
                  mediaUrl: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Message sent" },
        },
      },
    },
    "/v1/conversations/{id}/status": {
      patch: {
        summary: "Update Conversation Status",
        tags: ["Conversations"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["status"],
                properties: {
                  status: { type: "string", enum: ["bot", "waiting", "active", "resolved", "hold"] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Status updated" },
        },
      },
    },
    "/v1/webhooks": {
      get: {
        summary: "List Webhooks",
        tags: ["Webhooks"],
        responses: {
          200: {
            description: "List of configured webhooks",
          },
        },
      },
      post: {
        summary: "Register Webhook",
        tags: ["Webhooks"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "url"],
                properties: {
                  name: { type: "string", example: "CRM Lead Sync" },
                  url: { type: "string", example: "https://crm.example.com/webhooks/wa" },
                  secret: { type: "string", description: "HMAC secret (auto-generated if omitted)" },
                  events: {
                    type: "array",
                    items: { type: "string" },
                    example: ["message.received", "conversation.status_changed"],
                  },
                  isActive: { type: "boolean", default: true },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Webhook created" },
        },
      },
    },
    "/v1/webhooks/{id}/test": {
      post: {
        summary: "Test Webhook Ping",
        tags: ["Webhooks"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Ping delivery result" },
        },
      },
    },
    "/v1/webhooks/deliveries/logs": {
      get: {
        summary: "Get Webhook Delivery Logs",
        tags: ["Webhooks"],
        parameters: [
          { name: "webhookId", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
        ],
        responses: {
          200: { description: "Delivery logs" },
        },
      },
    },
    "/v1/stock": {
      get: {
        summary: "Get Stock Inventory",
        tags: ["Stock"],
        responses: {
          200: { description: "Product stock list" },
        },
      },
    },
    "/v1/stock/sync": {
      post: {
        summary: "Sync Stock Immediately",
        tags: ["Stock"],
        responses: {
          200: { description: "Sync triggered" },
        },
      },
    },
    "/v1/gateway/status": {
      get: {
        summary: "Check WhatsApp Gateway Status",
        tags: ["Gateway"],
        responses: {
          200: { description: "Connection status and QR code if connecting" },
        },
      },
    },
  },
};

export const docsRouter = Router();

// Endpoint for OpenAPI Specification JSON
docsRouter.get("/openapi.json", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json");
  res.json(openApiSpec);
});

// Endpoint for Interactive Documentation UI (Scalar modern docs)
docsRouter.get("/", (_req: Request, res: Response) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>WA-AKG Business — API Reference & Docs</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2310b981'><path d='M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'/></svg>" />
  <style>
    body {
      margin: 0;
      background-color: #020617;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
  </style>
</head>
<body>
  <script
    id="api-reference"
    data-url="/api/docs/openapi.json"
    data-configuration='{
      "theme": "elysia",
      "darkMode": true,
      "layout": "modern",
      "showSidebar": true
    }'
  ></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});
