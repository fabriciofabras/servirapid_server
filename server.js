import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import fs from "fs";
import PDFDocument from "pdfkit";
import OrdenPDF from "./OrdenPDF.js";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ruta absoluta a la imagen
const logoPath = path.resolve(__dirname, "public", "logo_servirrapid.png");

const logo = fs.readFileSync(logoPath);

dotenv.config();

const app = express();
app.use(cors());

const storage = multer.memoryStorage();
const upload = multer({ storage });


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

app.post("/api/generar-pdf", upload.array("imagenes"), async (req, res) => {

  console.log("req",req.body)

  console.log("api/generar-pdf")
  try {

    const form = {
      ...req.body,
      cliente: JSON.parse(req.body.cliente || "{}"),
      auto: JSON.parse(req.body.auto || "{}"),
    };

    // ✅ Imágenes subidas
    const imagenes = req.files || [];
    console.log("form:", form)
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

    doc.font("Helvetica-Bold").fontSize(11).text(`${nuevaOrden.folio}`, leftX + 440, y);

    y = y + 110;

    doc.image(logo, leftX + 190, 30, { width: 120 });
    doc.text("CEL.: 5549293973 - 5533321757", 0, y, { align: "center" })


    doc.text("www.servirrapid.com.mx | servirrapid@hotmail.com", { align: "center", link: "http://www.servirrapid.com.mx" })
      .moveDown(2);

    y = y + 40;

    // --- DATOS DEL CLIENTE ---
    doc.font("Helvetica-Bold").fontSize(10).text("DATOS DEL PROPIETARIO O SOLICITANTE:", 60, y)
    doc.font("Helvetica-Bold").fontSize(10).text("DATOS DEL SERVICIO:", rightX + 50, y);

    doc
      .moveTo(leftX, y + 10)   // punto inicial (x1, y1)
      .lineTo(550, y + 10)  // punto final (x2, y2)
      .stroke();          // dibuja la línea
    y = y + 30;


    doc.font("Helvetica").fontSize(10);
    doc.text(`Nombre: ${form.cliente.nombre}`, leftX, y);
    doc.text(`Técnico: ${form.tecnico}`, rightX, y);

    y = y + 20
    doc.text(`Fecha: ${form.fecha}`, rightX, y);

    y = y + 20

    doc.text(
      `Dirección: ${form.cliente.calle} ${form.cliente.noExterior || ""} ${form.cliente.noInterior || ""}, ${form.cliente.colonia},`,
      leftX, y
    );

    doc.text(`Hora de asignación: ${form.horaAsignacion}`, rightX, y);

    y = y + 10

    doc.text(
      `${form.cliente.alcaldia}`,
      leftX + 50, y
    );

    y = y + 10

    doc.text(`Hora de contacto: ${form.horaContacto}`, rightX, y);

    y = y + 20;

    doc.text(`Identificación: ${form.cliente.tipoId || ""}`, leftX, y);
    doc.text(`Hora de término: ${form.horaTermino}`, rightX, y);

    y = y + 20;

    doc.text(`Teléfono: ${form.cliente.telefono}`, leftX, y);
    doc.text(`Fecha de término: ${form.fechaTermino}`, rightX, y);

    y = y + 30;


    // --- TRABAJO ---
    doc.font("Helvetica-Bold").fontSize(10).text(`TRABAJO A REALIZAR:`, 60, y,);
    doc
      .moveTo(leftX, y + 10)   // punto inicial (x1, y1)
      .lineTo(550, y + 10)  // punto final (x2, y2)
      .stroke();          // dibuja la línea

    y = y + 30;

    doc.font("Helvetica-Bold").fontSize(10).text(`${form.trabajo}:`, leftX, y);
    doc.font("Helvetica").fontSize(10).text(`${form.servicio}`, leftX + 35, y);

    y = y + 30;

    // --- AUTO ---
    doc.font("Helvetica-Bold").fontSize(10).text("DATOS DEL AUTO:", 60, y, { underline: true });
    doc
      .moveTo(leftX, y + 10)   // punto inicial (x1, y1)
      .lineTo(550, y + 10)  // punto final (x2, y2)
      .stroke();          // dibuja la línea

    y = y + 30;

    doc.font("Helvetica").fontSize(10);
    doc.text(`Placas: ${form.auto.placas}`, leftX, y);
    doc.text(`No. de serie: ${form.auto.noSerie}`, leftX + 150, y);
    doc.text(`Marca: ${form.auto.marca}`, rightX + 50, y);

    y = y + 20;

    doc.text(`Tipo: ${form.auto.tipoAuto}`, leftX, y);
    doc.text(`Año: ${form.auto.anio}`, leftX + 150, y);



    y = y + 30;

    // --- COSTOS ---
    doc.font("Helvetica-Bold").fontSize(10).text("COSTO MATERIAL Y MANO DE OBRA:", 60, y);
    doc.font("Helvetica").fontSize(10);
    doc
      .moveTo(leftX, y + 10)   // punto inicial (x1, y1)
      .lineTo(550, y + 10)  // punto final (x2, y2)
      .stroke();          // dibuja la línea


    y = y + 30;

    doc.text(`Método de pago: ${form.pago}`, leftX, y);
    doc.text(`Taller: ${form.taller}`, rightX, y);

    y = y + 20;

    doc.text(`Material: ${form.material}`, leftX, y);

    y = y + 20;

    doc.text(`Observaciones: ${form.observaciones}`, leftX, y);
    doc.font("Helvetica-Bold").fontSize(12).text(`Total: $${form.total}`, rightX, y, { align: "center" });


    y = y + 30;


    // --- CALIDAD ---
    doc.font("Helvetica-Bold").fontSize(10).text(`CALIDAD DEL SERVICIO: ${form.calidadServicio}`, leftX, y);

    y = y + 20;
    doc
      .fontSize(9)
      .font("Helvetica-Oblique")
      .text("*SOLICITA AL TÉCNICO LOS TÉRMINOS Y CONDICIONES PARA OBTENER 10% DE DESCUENTO EN TU SERVICIO*", 0, y, {
        align: "center",
      });

    // --- FIRMAS ---
    const firmaY = doc.y;
    if (form.firma) {
      const imgBuffer = Buffer.from(form.firma.replace(/^data:image\/png;base64,/, ""), "base64");
      doc.image(imgBuffer, leftX + 30, firmaY, { width: 150 });
      doc
        .moveTo(leftX, firmaY + 90)   // punto inicial (x1, y1)
        .lineTo(240, firmaY + 90)  // punto final (x2, y2)
        .stroke();
      doc.text("Nombre y firma del propietario o solicitante", leftX, firmaY + 100);
    }
    if (form.firmaTecnico) {
      const imgBuffer = Buffer.from(form.firmaTecnico.replace(/^data:image\/png;base64,/, ""), "base64");
      doc.image(imgBuffer, rightX + 50, firmaY, { width: 150 });
      doc
        .moveTo(350, firmaY + 90)   // punto inicial (x1, y1)
        .lineTo(540, firmaY + 90)  // punto final (x2, y2)
        .stroke();
      doc.text("Técnico", rightX + 60, firmaY + 100, { width: 150, align: "center" });
    }

    // --- PIE DE PÁGINA ---
    doc.moveDown(2);

    // =======================
    // 🖼️ Páginas 2+ - Imágenes
    // =======================
    if (imagenes.length > 0) {
      const imgHeight = 250; // altura deseada
      const marginY = 100; // margen superior
      const spacing = 40; // espacio entre imágenes

      let imgIndex = 0;

      doc.addPage(); // comenzamos página 2

      while (imgIndex < imagenes.length) {
        const pageWidth = doc.page.width;

        // --- Primera imagen ---
        const img1 = imagenes[imgIndex];
        const y1 = marginY;

        try {
          const img1TmpPath = `temp_${Date.now()}_${img1.originalname}`;
          fs.writeFileSync(img1TmpPath, img1.buffer);

          const { width: w1, height: h1 } = doc.openImage(img1TmpPath);
          const aspect1 = w1 / h1;
          const displayWidth1 = imgHeight * aspect1;
          const x1 = (pageWidth - displayWidth1) / 2;

          doc.image(img1TmpPath, x1, y1, {
            width: displayWidth1,
            height: imgHeight,
          });

          fs.unlinkSync(img1TmpPath); // eliminar archivo temporal
        } catch (err) {
          console.error("Error al agregar imagen 1:", err);
        }

        imgIndex++;

        // --- Segunda imagen (si existe) ---
        if (imgIndex < imagenes.length) {
          const img2 = imagenes[imgIndex];
          const y2 = marginY + imgHeight + spacing;

          try {
            const img2TmpPath = `temp_${Date.now()}_${img2.originalname}`;
            fs.writeFileSync(img2TmpPath, img2.buffer);

            const { width: w2, height: h2 } = doc.openImage(img2TmpPath);
            const aspect2 = w2 / h2;
            const displayWidth2 = imgHeight * aspect2;
            const x2 = (pageWidth - displayWidth2) / 2;

            doc.image(img2TmpPath, x2, y2, {
              width: displayWidth2,
              height: imgHeight,
            });

            fs.unlinkSync(img2TmpPath);
          } catch (err) {
            console.error("Error al agregar imagen 2:", err);
          }

          imgIndex++;
        }

        // Si aún hay más imágenes, agregar una nueva página
        if (imgIndex < imagenes.length) doc.addPage();
      }}


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
