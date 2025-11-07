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

const orderSchema = new mongoose.Schema({
  folio: { type: String, unique: true },
  fecha: String,
  taller: String,
  tecnico: String,
  cliente: {
    nombre: String,
    telefono: String,
    calle: String,
    noExterior: String,
    noInterior: String,
    colonia: String,
    alcaldia: String,
  },
  auto: {
    placas: String,
    noSerie: String,
    marca: String,
    tipoAuto: String,
    anio: String,
  },
  servicio: String,
  material: String,
  pago: String,
  costoMaterial: Number,
  manoDeObra: Number,
  total: Number,
  firma: String,
  firmaTecnico: String,
  horaAsignacion: String,
  horaContacto: String,
  horaTermino: String,
  fechaTermino: String,
  trabajo: String,
  observaciones: String,
  calidadServicio: String,
}, { timestamps: true });

orderSchema.pre("save", async function (next) {
  if (this.folio) return next();

  const lastOrder = await this.constructor.findOne().sort({ folio: -1 });
  let nextNumber = 1;

  if (lastOrder && lastOrder.folio) {
    const num = parseInt(lastOrder.folio.split("-")[1]);
    if (!isNaN(num)) nextNumber = num + 1;
  }

  this.folio = `OR-${String(nextNumber).padStart(4, "0")}`;
  next();
});

const Order = mongoose.model("Order", orderSchema, "ordenes");

app.post("/api/generar-pdf", async (req, res) => {
  try {
    const form = req.body;

    // Guardar en Mongo y generar folio
    const nuevaOrden = new Order(form);
    await nuevaOrden.save();

    // Crear PDF
    const doc = new PDFDocument({ margin: 40 });
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", async () => {
      const pdfBuffer = Buffer.concat(buffers);
      const nuevaOrdenPDF = new OrdenPDF({
        folio: nuevaOrden.folio,
        pdf: pdfBuffer,
      });
      await nuevaOrdenPDF.save();
      res.json({ message: "PDF generado correctamente", folio: nuevaOrden.folio });
    });

    const leftX = 50;
    const rightX = 320;

    // --- LOGO Y ENCABEZADO ---
    let y = doc.y;

    doc.image("public/logo_servirrapid.png", leftX + 170, 30, { width: 120 });
    doc
      .fontSize(9)
      .text("CEL.: 5549293973 - 5533321757", { align: "center" }, y)
      .text("www.servirrapid.com.mx | servirrapid@hotmail.com", { align: "center", link: "http://www.servirrapid.com.mx" })
      .moveDown(2);

    // --- DATOS DEL SERVICIO ---
    doc.font("Helvetica-Bold").fontSize(11).text("DATOS DEL SERVICIO:", { underline: true }).moveDown(0.5);

    doc.font("Helvetica").fontSize(10);
    doc.text(`Técnico: ${form.tecnico}`, rightX, y);
    doc.text(`No. de servicio: ${nuevaOrden.folio}`, leftX, y);
    doc.text(`Fecha: ${form.fecha}`, rightX, y + 12);
    doc.text(`Hora de asignación: ${form.horaAsignacion}`, leftX, y + 24);
    doc.text(`Hora de contacto: ${form.horaContacto}`, rightX, y + 24);
    doc.text(`Hora de término: ${form.horaTermino}`, leftX, y + 36);
    doc.text(`Fecha de término: ${form.fechaTermino}`, rightX, y + 36);

    doc.moveDown(3);

    // --- DATOS DEL CLIENTE ---
    doc.font("Helvetica-Bold").fontSize(11).text("DATOS DEL PROPIETARIO O SOLICITANTE:", { underline: true });
    y = doc.y + 5;
    doc.font("Helvetica").fontSize(10);
    doc.text(`Nombre: ${form.cliente.nombre}`, leftX, y);
    doc.text(`Teléfono: ${form.cliente.telefono}`, rightX, y);
    doc.text(
      `Dirección: ${form.cliente.calle} ${form.cliente.noExterior || ""} ${form.cliente.noInterior || ""}, ${form.cliente.colonia}, ${form.cliente.alcaldia}`,
      leftX,
      y + 15,
      { width: 500 }
    );
    doc.text(`Tipo ID: ${form.cliente.tipoId || ""}`, leftX, y + 40);

    doc.moveDown(3);

    // --- TRABAJO ---
    doc.font("Helvetica-Bold").fontSize(11).text("TRABAJO A REALIZAR:", { underline: true }).moveDown(0.5);
    doc.font("Helvetica").text(`Tipo de trabajo: ${form.trabajo}`).moveDown(1);

    // --- AUTO ---
    doc.font("Helvetica-Bold").fontSize(11).text("DATOS DEL AUTO:", { underline: true }).moveDown(0.5);
    doc.font("Helvetica").fontSize(10);
    doc.text(`Placas: ${form.auto.placas}`, leftX);
    doc.text(`# de serie: ${form.auto.noSerie}`, rightX);
    doc.text(`Marca: ${form.auto.marca}`, leftX, doc.y + 12);
    doc.text(`Tipo: ${form.auto.tipoAuto}`, rightX, doc.y);
    doc.text(`Año: ${form.auto.anio}`, leftX, doc.y + 12).moveDown(2);

    // --- COSTOS ---
    doc.font("Helvetica-Bold").fontSize(11).text("COSTO MATERIAL Y MANO DE OBRA:", { underline: true }).moveDown(0.5);
    doc.font("Helvetica").fontSize(10);
    doc.text(`Método de pago: ${form.pago}`, leftX);
    doc.text(`Taller: ${form.taller}`, rightX);
    doc.text(`Material: ${form.material}`, leftX, doc.y + 12);
    doc.text(`Observaciones: ${form.observaciones}`, leftX, doc.y + 24);
    doc.text(`Total: $${form.total}`, { align: "right" }).moveDown(2);

    // --- CALIDAD ---
    doc.font("Helvetica-Bold").fontSize(11).text("Calidad del servicio:", { underline: true });
    doc.font("Helvetica").fontSize(10).text("☐ Excelente   ☐ Bueno   ☐ Regular   ☐ Malo").moveDown(2);

    // --- FIRMAS ---
    const firmaY = doc.y;
    if (form.firma) {
      const imgBuffer = Buffer.from(form.firma.replace(/^data:image\/png;base64,/, ""), "base64");
      doc.image(imgBuffer, leftX, firmaY, { width: 150 });
      doc.text("Nombre y firma del propietario o solicitante", leftX, firmaY + 100, { width: 150, align: "center" });
    }
    if (form.firmaTecnico) {
      const imgBuffer = Buffer.from(form.firmaTecnico.replace(/^data:image\/png;base64,/, ""), "base64");
      doc.image(imgBuffer, rightX, firmaY, { width: 150 });
      doc.text("Técnico", rightX, firmaY + 100, { width: 150, align: "center" });
    }

    // --- PIE DE PÁGINA ---
    doc.moveDown(2);
    doc
      .fontSize(9)
      .font("Helvetica-Oblique")
      .text("*SOLICITA AL TÉCNICO LOS TÉRMINOS Y CONDICIONES PARA OBTENER 10% DE DESCUENTO EN TU SERVICIO*", {
        align: "center",
      });

    doc.end();
  } catch (error) {
    console.error("❌ Error generando PDF:", error);
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
