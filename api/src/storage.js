const {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  PutObjectCommand,
  GetObjectCommand
} = require("@aws-sdk/client-s3");

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// Cliente interno → usado pelo backend dentro do Docker
const internalS3 = new S3Client({
  region: "us-east-1",
  endpoint: process.env.S3_ENDPOINT, // minio:9000
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY
  }
});

// Cliente público → usado APENAS para gerar presigned URLs
const publicS3 = new S3Client({
  region: "us-east-1",
  endpoint: process.env.S3_PUBLIC_ENDPOINT, // localhost:9000
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY
  }
});

// -------- MULTIPART UPLOAD --------

async function initMultipartUpload(bucket, key) {
  const command = new CreateMultipartUploadCommand({
    Bucket: bucket,
    Key: key
  });
  return internalS3.send(command); // usa o interno
}

async function getPresignedPartUrl(bucket, key, uploadId, partNumber) {
  const command = new UploadPartCommand({
    Bucket: bucket,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber
  });

  return await getSignedUrl(publicS3, command, { expiresIn: 3600 });
}

async function completeMultipart(bucket, key, uploadId, parts) {
  const command = new CompleteMultipartUploadCommand({
    Bucket: bucket,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts }
  });

  return internalS3.send(command); // usa o interno
}

// -------- DOWNLOAD --------

async function generateDownloadUrl(bucket, key, expires = 3600) {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key
  });

  return await getSignedUrl(publicS3, command, { expiresIn: expires });
}

module.exports = {
  initMultipartUpload,
  getPresignedPartUrl,
  completeMultipart,
  generateDownloadUrl
};
