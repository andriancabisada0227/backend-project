const zlib = require('zlib');

const compressionMiddleware = (req, res, next) => {
  const acceptEncoding = req.headers["accept-encoding"] || req.headers["Accept-Encoding"] || "";

  if (acceptEncoding.includes("br")) {
    res.setHeader("Content-Encoding", "br");
    const brotli = zlib.createBrotliCompress();
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);

    brotli.on("data", (chunk) => originalWrite(chunk));
    brotli.on("end", () => originalEnd());

    res.write = (chunk, encoding) => brotli.write(chunk, encoding);
    res.end = (chunk, encoding) => {
      if (chunk) brotli.write(chunk, encoding);
      brotli.end();
    };
  } else if (acceptEncoding.includes("gzip")) {
    res.setHeader("Content-Encoding", "gzip");
    const gzip = zlib.createGzip();
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);

    gzip.on("data", (chunk) => originalWrite(chunk));
    gzip.on("end", () => originalEnd());

    res.write = (chunk, encoding) => gzip.write(chunk, encoding);
    res.end = (chunk, encoding) => {
      if (chunk) gzip.write(chunk, encoding);
      gzip.end();
    };
  } else if (acceptEncoding.includes("deflate")) {
    res.setHeader("Content-Encoding", "deflate");
    const deflate = zlib.createDeflate();
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);

    deflate.on("data", (chunk) => originalWrite(chunk));
    deflate.on("end", () => originalEnd());

    res.write = (chunk, encoding) => deflate.write(chunk, encoding);
    res.end = (chunk, encoding) => {
      if (chunk) deflate.write(chunk, encoding);
      deflate.end();
    };
  }
  next();
};

module.exports = compressionMiddleware; 