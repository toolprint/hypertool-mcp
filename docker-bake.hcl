variable "TAG" {
  default = "latest"
}

variable "REGISTRY" {
  default = "localhost"
}

variable "VERSION" {
  default = "0.0.31"
}

group "default" {
  targets = ["hypertool-mcp"]
}

target "hypertool-mcp" {
  dockerfile = "Dockerfile"
  tags = [
    "hypertool-mcp:${TAG}",
    "hypertool-mcp:${VERSION}",
    "hypertool-mcp:latest"
  ]
  platforms = [
    "linux/amd64",
    "linux/arm64"
  ]
  cache-from = [
    "type=gha"
  ]
  cache-to = [
    "type=gha,mode=max"
  ]
  output = ["type=image"]
}

target "hypertool-mcp-local" {
  inherits = ["hypertool-mcp"]
  output = ["type=docker"]
  platforms = ["linux/arm64", "linux/amd64"]
  tags = [
    "hypertool-mcp:latest",
    "hypertool-mcp:${VERSION}",
    "hypertool-mcp:local"
  ]
}

target "hypertool-mcp-dev" {
  inherits = ["hypertool-mcp-local"]
  tags = [
    "hypertool-mcp:dev"
  ]
  cache-from = [
    "type=local,src=.buildx-cache"
  ]
  cache-to = [
    "type=local,dest=.buildx-cache,mode=max"
  ]
}