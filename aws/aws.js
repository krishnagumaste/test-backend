import {
    S3Client,
    GetObjectCommand,
    PutObjectCommand,
  } from "@aws-sdk/client-s3";
  import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
  import dotenv from "dotenv";
  dotenv.config();
  
  const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  
  export async function getObject(filename) {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET,
      Key: filename,
    });
  
    const url = await getSignedUrl(s3Client, command);
    return url;
  }
  
  export async function putObject(filename, contentType) {
    const command = new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET,
        Key: filename,
        ContentType: contentType,
    });
    const url = await getSignedUrl(s3Client, command);
    return url;
  }
  