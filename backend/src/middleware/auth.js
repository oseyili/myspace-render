export function protect(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const expected = process.env.MYSPACE_ADMIN_TOKEN || "";

  if (!expected) return res.status(500).json({ message: "Server missing MYSPACE_ADMIN_TOKEN" });
  if (!token || token !== expected) return res.status(401).json({ message: "Unauthorized" });

  next();
}
