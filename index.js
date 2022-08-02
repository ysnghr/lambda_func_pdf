const fs = require('fs').promises;
const AWS = require('aws-sdk');
const gm = require("gm").subClass({imageMagick: true});
const s3 = new AWS.S3();
const PDFDocument = require('pdf-lib').PDFDocument;



async function splitPdf(body, bucket, dist, fileName) {

  const pdfDoc = await PDFDocument.load(body);
  const numberOfPages = pdfDoc.getPages().length;

  for (let i = 0; i < numberOfPages; i++) {

      // Create a new "sub" document
      const subDocument = await PDFDocument.create();
      // copy the page at current index
      const [copiedPage] = await subDocument.copyPages(pdfDoc, [i])
      subDocument.addPage(copiedPage);
      const pdfBytes = await subDocument.save();
      s3.putObject({
        Bucket: bucket,
        Key: `${dist}/${fileName}-${i + 1}.` + "pdf",
        ContentType: 'application/pdf',
        Body: pdfBytes,
      }, (error, data) => {
        if (error) {
          console.log("gm conversion process error::22");
          reject(error);
        }
      });
  }
}


const convert = (body, index, conversion_params, bucket, dist) => {
  let height = conversion_params["height"];
  let width = conversion_params["width"];

  return new Promise((resolve, reject) => {
    console.log(`gm process started: page ${index}.`);
    gm(body, `pdf.pdf[${index}]`)
      .resize(width, height).gravity('Center').extent(width, height)
      .setFormat(conversion_params["format"])
      .stream((error, stdout, stderr) => {
        if (error) {
          console.log("gm conversion process error::1");
          reject(error);
        }
        const chunks = [];
        stdout.on('data', (chunk) => {
          chunks.push(chunk);
        });
        stdout.on('end', () => {
          console.log(`gm process complete: page ${index}.`);
          const buffer = Buffer.concat(chunks);
          s3.putObject({
            Bucket: bucket,
            Key: `${dist}/${index}.` + conversion_params["format"],
            ContentType: 'image/' + conversion_params["format"],
            Body: buffer,
          }, (error, data) => {
            if (error) {
              console.log("gm conversion process error::2");
              reject(error);
            }
            resolve();
          });
        });
        stderr.on('data', (data) => {
          console.log('stderr:', data);
        });
      });
  });
}
async function handler(event, context, callback) {
  try {
    console.log('starting converting process...');
    console.log('start downloaded PDF...');
    var key = decodeURIComponent(event.pdfkey.replace(/\+/g, " ")); 
    var bucket = event.bucket;
    var conversion_params = {
      "format": event.format ? event.format : "webp",
      "width": event.width ? event.width : 595,
      "height": event.height ? event.height : 842
    }

    const pdf = await s3.getObject({
      Bucket: bucket,
      Key: key,
    }).promise();
    console.log('converting PDF to images...');
    const fileName = key.replace('.pdf','');

    await convert(pdf.Body, 0, conversion_params, bucket, key);
    await splitPdf(pdf.Body, bucket, key, fileName);
    callback(null, {
      statusCode: 200,
      message: 'Success',
    });
  } catch (error) {
    console.error(JSON.stringify(error));
    callback(null, {
      statusCode: 400,
      message: 'Failed',
    });
  }
}
exports.handler = handler;
