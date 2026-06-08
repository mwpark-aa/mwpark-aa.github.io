FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod .
COPY main.go .
RUN go build -o proxy .

FROM alpine:latest
RUN apk --no-cache add ca-certificates
COPY --from=builder /app/proxy .
EXPOSE 8080
CMD ["./proxy"]