# Multi-stage Docker build for hypertool-mcp service with Node.js 22 and multi-arch support
FROM node:22-alpine AS builder

# Use buildx automatic platform variables for cross-compilation
ARG TARGETPLATFORM
ARG BUILDPLATFORM
ARG TARGETOS
ARG TARGETARCH

# Install build dependencies including Python/UV
RUN apk add --no-cache \
    python3 \
    py3-pip \
    python3-dev \
    build-base \
    linux-headers

# Install UV (Python package manager) - bypass Alpine's externally managed environment
RUN pip3 install --no-cache-dir --break-system-packages uv

# Set cross-compilation environment for Node.js native modules
ENV npm_config_target_platform=$TARGETOS
ENV npm_config_target_arch=$TARGETARCH
ENV npm_config_cache=/tmp/.npm

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:22-alpine AS production

# Use buildx automatic platform variables
ARG TARGETPLATFORM
ARG BUILDPLATFORM
ARG TARGETOS
ARG TARGETARCH

# Install runtime dependencies including Python/UV, timezone data, and system utilities
RUN apk add --no-cache \
    python3 \
    py3-pip \
    curl \
    dumb-init \
    tzdata \
    ca-certificates \
    coreutils \
    bash \
    procps \
    git \
    && pip3 install --no-cache-dir --break-system-packages uv \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S hypertool && \
    adduser -S hypertool -u 1001 -G hypertool

# Set working directory
WORKDIR /app

# Copy package files with correct ownership
COPY --chown=hypertool:hypertool package*.json ./

# Set cross-compilation environment
ENV npm_config_target_platform=$TARGETOS
ENV npm_config_target_arch=$TARGETARCH

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage with correct ownership
COPY --from=builder --chown=hypertool:hypertool /app/dist ./dist
COPY --from=builder --chown=hypertool:hypertool /app/examples ./examples

# Create necessary directories with correct ownership
RUN mkdir -p /app/logs /app/tmp /app/config && \
    chown -R hypertool:hypertool /app

# Copy default configuration files
COPY --chown=hypertool:hypertool mcp.container.json /app/config/mcp.json

# Initialize a test git repository for mcp-server-git (run as root before user switch)
RUN cd /app && \
    git config --global --add safe.directory /app && \
    git config --global user.email "test@hypertool.local" && \
    git config --global user.name "Hypertool Test" && \
    git config --global init.defaultBranch main && \
    git init && \
    echo "# Hypertool MCP Test Repository" > README.md && \
    echo "This is a test git repository for mcp-server-git functionality." >> README.md && \
    echo "" >> README.md && \
    echo "## Files" >> README.md && \
    echo "- README.md - This file" >> README.md && \
    echo "- package.json - Node.js package configuration" >> README.md && \
    git add README.md package.json && \
    git commit -m "Initial commit: Add README and package.json" && \
    chown -R hypertool:hypertool /app/.git /app/README.md

# Set environment variables
ENV NODE_ENV=production
ENV DOCKER_CONTAINER=true
ENV HYPERTOOL_PORT=8080
ENV HYPERTOOL_HOST=0.0.0.0
ENV UV_SYSTEM_PYTHON=1
ENV NODE_OPTIONS="--max-old-space-size=512"
ENV TZ=UTC
ENV PYTHONUNBUFFERED=1

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Switch to non-root user
USER hypertool

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Default command - run server directly with HTTP transport on port 8080
CMD ["node", "dist/server.js", "--transport", "http", "--port", "8080", "--host", "0.0.0.0", "--mcp-config", "/app/config/mcp.json", "--log-level", "info"]
