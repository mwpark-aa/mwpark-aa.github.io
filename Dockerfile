FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY proxy/go.mod ./
RUN go mod download
COPY proxy/ ./
RUN go build -o proxy .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/proxy .
EXPOSE 8080
CMD ["./proxy"]