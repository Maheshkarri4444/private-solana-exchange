import { Router } from "express";
import multer from "multer";
import { gatewayUrl, pinFile, pinJson } from "../pinata.js";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith("image/")),
});

export const metadataRouter = Router();

/**
 * POST /api/metadata  (multipart: image, name, symbol, description)
 * Pins the image and a token metadata JSON to IPFS. Returns the JSON's URI,
 * which goes into the on-chain Token-2022 metadata.
 */
metadataRouter.post("/", upload.single("image"), async (req, res) => {
  const name = String(req.body.name ?? "").trim();
  const symbol = String(req.body.symbol ?? "").trim().toUpperCase();
  const description = String(req.body.description ?? "").trim();

  if (!name || name.length > 32 || !symbol || symbol.length > 10 || description.length > 500) {
    res.status(400).json({ error: "name (1-32), symbol (1-10) and description (≤500) required" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "image (png/jpg/svg/webp, ≤2MB) required" });
    return;
  }

  try {
    const imageCid = await pinFile(req.file.buffer, req.file.originalname, req.file.mimetype);
    const image = gatewayUrl(imageCid);
    const metadataCid = await pinJson(`${symbol}-metadata.json`, {
      name,
      symbol,
      description,
      image,
    });
    res.json({ uri: gatewayUrl(metadataCid), image });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "IPFS upload failed" });
  }
});
