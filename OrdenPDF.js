import mongoose from "mongoose";

const ordenPDFSchema = new mongoose.Schema({
  folio: { type: String, required: true },
  pdf: { type: Buffer, required: true },
});

const OrdenPDF = mongoose.model("OrdenPDF", ordenPDFSchema);

export default OrdenPDF;
