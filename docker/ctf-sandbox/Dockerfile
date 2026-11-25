FROM alpine:3.20

RUN apk add --no-cache \
      file \
      binutils \
      coreutils \
      bash \
      python3 \
      jq \
      xxd \
      tcpdump \
    && addgroup -g 65534 -S nobody 2>/dev/null || true

WORKDIR /analysis
USER 65534:65534

ENTRYPOINT []
CMD ["sh"]
