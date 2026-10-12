const zlib = require("zlib");

const compressionMiddleware = (req, res, next) => {
  const acceptEncoding = req.headers["accept-encoding"] || req.headers["Accept-Encoding"] || "";
  const origSend = res.send.bind(res);

  res.send = (body) => {
    if (!body || res.headersSent) {
      return origSend(body);
    }

    const buffer = Buffer.isBuffer(body)
      ? body
      : typeof body === "string"
      ? Buffer.from(body)
      : Buffer.from(JSON.stringify(body));

    if (buffer.length < 1024) {
      return origSend(body);
    }

    if (acceptEncoding.includes("br")) {
      zlib.brotliCompress(buffer, (err, compressed) => {
        if (err) return origSend(body);
        res.setHeader("Content-Encoding", "br");
        res.removeHeader("Content-Length");
        origSend(compressed);
      });
    } else if (acceptEncoding.includes("gzip")) {
      zlib.gzip(buffer, (err, compressed) => {
        if (err) return origSend(body);
        res.setHeader("Content-Encoding", "gzip");
        res.removeHeader("Content-Length");
        origSend(compressed);
      });
    } else if (acceptEncoding.includes("deflate")) {
      zlib.deflate(buffer, (err, compressed) => {
        if (err) return origSend(body);
        res.setHeader("Content-Encoding", "deflate");
        res.removeHeader("Content-Length");
        origSend(compressed);
      });
    } else {
      return origSend(body);
    }
  };

  next();
};

module.exports = compressionMiddleware;