import { getObject, putObject } from "./aws.js";

export const handleGetUrl = async (req,res) => {
    const image = req.body.image;
  try {
    const result = await putObject(image, "/image/jpeg");

    if (result) {
      res.status(200).json({ url: result });
    } else {
      res.status(500).json({ message: "Failed to generate Presigned URL" });
    }
  } catch (err) {
    res.status(500).send(err);
  }
}

export const handleImageUrl = async (req,res) => {
  const image = req.body.image;

  try {
    const result = await getObject(image, "/image/jpeg");

    if (result) {
      res.status(200).json({ url: result });
    } else {
      res.status(500).json({ message: "Failed to generate Presigned URL" });
    }
  } catch (err) {
    res.status(500).send(err);
  }
}