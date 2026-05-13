# Stage 1: Build the binary
FROM golang:1.26-alpine AS builder

WORKDIR /app

# Install dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the Go app
RUN CGO_ENABLED=0 GOOS=linux go build -o /omnimarket-engine ./cmd/server

# Stage 2: Run the binary
FROM alpine:latest

WORKDIR /

COPY --from=builder /omnimarket-engine /omnimarket-engine

EXPOSE 8080

CMD ["/omnimarket-engine"]
