const zlib = require('zlib');

const compressionMiddleware = (req, res, next) => {
  const acceptEncoding = req.headers["accept-encoding"] || "";

  if (acceptEncoding.includes("br")) {
    res.setHeader("Content-Encoding", "br");
    const brotli = zlib.createBrotliCompress();
    res.write = (data) => brotli.write(data);
    res.end = () => brotli.end();
    brotli.pipe(res);
  } else if (acceptEncoding.includes("gzip")) {
    res.setHeader("Content-Encoding", "gzip");
    const gzip = zlib.createGzip();
    res.write = (data) => gzip.write(data);
    res.end = () => gzip.end();
    gzip.pipe(res);
  } else if (acceptEncoding.includes("deflate")) {
    res.setHeader("Content-Encoding", "deflate");
    const deflate = zlib.createDeflate();
    res.write = (data) => deflate.write(data);
    res.end = () => deflate.end();
    deflate.pipe(res);
  } else {
    next();
  }
};

module.exports = compressionMiddleware; 