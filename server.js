import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import fs from "fs";
import PDFDocument from "pdfkit";
import OrdenPDF from "./OrdenPDF.js";


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Conexión a MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    dbName: process.env.DB_NAME,
  })
  .then(() => console.log("✅ Conectado a MongoDB"))
  .catch((err) => console.error("❌ Error al conectar a MongoDB:", err));

// Definición del esquema y modelo
const orderSchema = new mongoose.Schema({
  folio: String,
  fecha: String,
  taller: String,
  tecnico: String,
  cliente: {
    nombre: String,
    telefono: String,
    direccion: String,
  },
  servicio: String,
  material: String,
  pago: String,
  costoMaterial: Number,
  manoDeObra: Number,
  total: Number,
});

const Order = mongoose.model("Order", orderSchema, "ordenes");

// 🧾 Generar PDF y guardarlo en MongoDB
app.post("/api/generar-pdf", async (req, res) => {
  try {
    const form = req.body;

    // Crear el documento PDF en memoria
    const doc = new PDFDocument();
    const buffers = [];

    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", async () => {
      const pdfBuffer = Buffer.concat(buffers);

      // Guardar en MongoDB
      const nuevaOrden = new OrdenPDF({
        folio: form.folio,
        pdf: pdfBuffer,
      });

      await nuevaOrden.save();

      res.json({
        message: "PDF generado y guardado correctamente en MongoDB",
        folio: form.folio,
      });
    });

    // Contenido del PDF
    doc.fontSize(18).text("ORDEN DE SERVICIO", { align: "center" });
    doc.moveDown();

    doc.fontSize(12);
    doc.text(`Folio: ${form.folio}`);
    doc.text(`Fecha: ${form.fecha}`);
    doc.text(`Taller: ${form.taller}`);
    doc.text(`Técnico: ${form.tecnico}`);
    doc.moveDown();

    doc.text("Cliente:");
    doc.text(`Nombre: ${form.cliente.nombre}`);
    doc.text(`Teléfono: ${form.cliente.telefono}`);
    doc.text(`Dirección: ${form.cliente.direccion}`);
    doc.moveDown();

    doc.text("Detalles del Servicio:");
    doc.text(`Servicio: ${form.servicio}`);
    doc.text(`Material: ${form.material}`);
    doc.text(`Pago: ${form.pago}`);
    doc.moveDown();

    doc.text(`Costo Material: $${form.costoMaterial}`);
    doc.text(`Mano de Obra: $${form.manoDeObra}`);
    doc.text(`Total: $${form.total}`, { underline: true });
    doc.moveDown();

    if (form.firma) {
      const base64Data = form.firma.replace(/^data:image\/png;base64,/, "");
      const imgBuffer = Buffer.from(base64Data, "base64");

      // agregamos la imagen al PDF
      doc.image(imgBuffer, 50, 400, { width: 150 }); // x, y, width opcional
      doc.text("Firma del cliente", 50, 560);
    }

    doc.text("Gracias por su preferencia.", { align: "center" });

    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error generando el PDF" });
  }
});

// Endpoint GET para obtener órdenes
app.get("/getOrders", async (req, res) => {
  try {
    const orders = await Order.find();
    res.json(orders);
  } catch (error) {
    console.error("Error al obtener órdenes:", error);
    res.status(500).json({ message: "Error al obtener órdenes" });
  }
});

// POST: crear una nueva orden
app.post("/addOrder", async (req, res) => {
  try {
    const nuevaOrden = new Order(req.body);
    await nuevaOrden.save();
    res.status(201).json({ message: "Orden creada exitosamente", orden: nuevaOrden });
  } catch (error) {
    console.error("Error al crear la orden:", error);
    res.status(500).json({ message: "Error al crear la orden" });
  }
});

app.get("/api/descargar-pdf/:folio", async (req, res) => {
  try {
    const { folio } = req.params;

    const orden = await OrdenPDF.findOne({ folio });

    if (!orden || !orden.pdf) {
      return res.status(404).json({ error: "PDF no encontrado" });
    }

    // Configurar encabezados para forzar la descarga
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=orden-${folio}.pdf`);

    // Enviar el buffer como respuesta
    res.send(orden.pdf);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al descargar el PDF" });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
