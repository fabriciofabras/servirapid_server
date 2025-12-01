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
import nodemailer from "nodemailer";
import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ruta absoluta a la imagen
const logoPath = path.resolve(__dirname, "public", "logo_servirrapid.png");

const logo = fs.readFileSync(logoPath);

dotenv.config();

const app = express();
app.use(
  cors({
    origin: [
      "https://servirapid.vercel.app", // tu frontend
      "http://localhost:5173"          // útil en desarrollo
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);
app.options("*", cors());


app.use(express.json());
app.use(express.urlencoded({ extended: true }))

const storage = multer.memoryStorage();
const upload = multer({ storage });


// Conexión a MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    dbName: process.env.DB_NAME,
  })
  .then(() => console.log("✅ Conectado a MongoDB"))
  .catch((err) => console.error("❌ Error al conectar a MongoDB:", err));

/** ---------- ESQUEMA USUARIOS (AQUÍ ESTÁ LA CORRECCIÓN) ---------- **/
const usuariosSchema = new mongoose.Schema({
  usuario: String,
  password: String,
  perfil: String,
  mustChangePassword: Boolean
});

const Usuarios = mongoose.model("Usuarios", usuariosSchema, "usuarios");

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
    correo: String
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

let db;
const uri = process.env.MONGO_URI;

const dbName = 'servirapid';
let usuariosCollection;

MongoClient.connect(uri)
  .then(client => {
    console.log('✅ Conectado a la base de datos MongoDB');
    db = client.db(dbName);
    usuariosCollection = db.collection('usuarios');
  })
  .catch(error => console.error('❌ Error conectando a MongoDB:', error));


app.put("/api/marcar-pagado/:folio", async (req, res) => {
  try {
    const { folio } = req.params;

    await db.collection("ordenes").updateOne(
      { folio },
      { $set: { pagado: true, fechaPago: new Date() } }
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Error al marcar pagado." });
  }
});

app.post('/login', async (req, res) => {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', true);

  const { usuario, password, confirmNewSession, userId } = req.body;

  try {
    // 1️⃣ Buscar usuario
    const user = await Usuarios.findOne({ usuario });
    if (!user) {
      return res.status(404).json({ message: "El usuario no existe" });
    }

    let passwordMatch = false;

    // Si la contraseña guardada parece estar hasheada (empieza con $2)
    if (user.password && user.password.startsWith("$2")) {
      // Comparar usando bcrypt
      passwordMatch = await bcrypt.compare(password, user.password);
    } else {
      // Comparar texto plano (usuario antiguo)
      passwordMatch = password === user.password;
    }
    console.log("Passwordmatch", passwordMatch)
    if (!passwordMatch) {
      return res.status(200).json({ message: "El usuario y/o contraseña son incorrectos" });
    }

    // 3️⃣ Si el usuario tiene una contraseña por defecto → forzar cambio
    if (user.mustChangePassword) {
      return res.status(200).json({
        message: "Debe cambiar su contraseña",
        userId: user._id,
        usuario: user.usuario,
        mustChangePassword: true,
        perfil: user.perfil
      });
    }

    console.log("✅ Usuario logueado correctamente");
    return res.status(200).json({
      message: "El usuario ha sido logueado",
      perfil: user.perfil
    });

  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ message: "Error del servidor", error: error.message });
  }
});

app.post("/api/generar-pdf", upload.array("imagenes"), async (req, res) => {

  console.log("req", req.body)

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
    y = y + 25;



    // Nombre y técnico
    doc.font("Helvetica-Bold").text("Nombre:", leftX, y, { continued: true });
    doc.font("Helvetica").text(` ${form.cliente.nombre}`);
    doc.font("Helvetica-Bold").text("Técnico:", rightX, y, { continued: true });
    doc.font("Helvetica").text(` ${form.tecnico}`);

    y = y + 20;

    // Fecha
    doc.font("Helvetica-Bold").text("Fecha:", rightX, y, { continued: true });
    doc.font("Helvetica").text(` ${form.fecha}`);

    y = y + 20;

    // Dirección
    doc.font("Helvetica-Bold").text("Dirección:", leftX, y, { continued: true });
    doc.font("Helvetica").text(
      ` ${form.cliente.calle} ${form.cliente.noExterior || ""} ${form.cliente.noInterior || ""}, `
    );
    doc.font("Helvetica-Bold").text("Hora de asignación:", rightX, y, { continued: true });
    doc.font("Helvetica").text(` ${form.horaAsignacion}`);

    y = y + 10;

    // Alcaldía
    doc.font("Helvetica").text(`${form.cliente.colonia}, ${form.cliente.alcaldia}`, leftX + 49, y);

    y = y + 10;

    // Hora de contacto
    doc.font("Helvetica-Bold").text("Hora de contacto:", rightX, y, { continued: true });
    doc.font("Helvetica").text(` ${form.horaContacto}`);

    y = y + 20;

    // Identificación y hora de término
    doc.font("Helvetica-Bold").text("Identificación:", leftX, y, { continued: true });
    doc.font("Helvetica").text(` ${form.cliente.tipoId || ""}`);
    doc.font("Helvetica-Bold").text("Hora de término:", rightX, y, { continued: true });
    doc.font("Helvetica").text(` ${form.horaTermino}`);

    y = y + 20;

    // Teléfono y fecha de término
    doc.font("Helvetica-Bold").text("Teléfono:", leftX, y, { continued: true });
    doc.font("Helvetica").text(` ${form.cliente.telefono}`);
    doc.font("Helvetica-Bold").text("Fecha de término:", rightX, y, { continued: true });
    doc.font("Helvetica").text(` ${form.fechaTermino}`);

    y = y + 25;


    // --- TRABAJO ---
    doc.font("Helvetica-Bold").fontSize(10).text(`TRABAJO A REALIZAR:`, 60, y,);
    doc
      .moveTo(leftX, y + 10)   // punto inicial (x1, y1)
      .lineTo(550, y + 10)  // punto final (x2, y2)
      .stroke();          // dibuja la línea

    y = y + 25;

    doc.font("Helvetica-Bold").fontSize(10).text(`${form.trabajo}:`, leftX, y);
    doc.font("Helvetica").fontSize(10).text(`${form.servicio}`, leftX + 40, y);

    y = y + 25;

    // --- AUTO ---
    doc.font("Helvetica-Bold").fontSize(10).text("DATOS DEL AUTO:", 60, y, { underline: true });
    doc
      .moveTo(leftX, y + 10)   // punto inicial (x1, y1)
      .lineTo(550, y + 10)  // punto final (x2, y2)
      .stroke();          // dibuja la línea

    y = y + 25;

    doc.font("Helvetica").fontSize(10);
    doc.text(`Placas: ${form.auto.placas}`, leftX, y);
    doc.text(`No. de serie: ${form.auto.noSerie}`, leftX + 150, y);
    doc.text(`Marca: ${form.auto.marca}`, rightX + 50, y);

    y = y + 20;

    doc.text(`Tipo: ${form.auto.tipoAuto}`, leftX, y);

    (form.auto.anio ? undefined : {

    })
    doc.text(
      `Año: ${form.auto.anio ? form.auto.anio : ""}`,
      leftX + 150,
      y
    );


    y = y + 25;

    // --- COSTOS ---
    doc.font("Helvetica-Bold").fontSize(10).text("COSTO MATERIAL Y MANO DE OBRA:", 60, y);
    doc.font("Helvetica").fontSize(10);
    doc
      .moveTo(leftX, y + 10)   // punto inicial (x1, y1)
      .lineTo(550, y + 10)  // punto final (x2, y2)
      .stroke();          // dibuja la línea


    y = y + 25;

    doc.text(`Método de pago: ${form.pago}`, leftX, y);
    doc.text(`Taller: ${form.taller}`, rightX, y);

    y = y + 20;

    doc.text(`Material: ${form.material}`, leftX, y);

    y = y + 20;

    doc.text(`Observaciones: ${form.observaciones}`, leftX, y);

    y = y + 40;

    doc.font("Helvetica-Bold").fontSize(12).text(`Total: $${form.total}`, rightX, y, { align: "center" });

    y += 15; // espacio entre líneas

    // Si aplica descuento, mostrar detalle

    console.log("form.descuento", form.descuento)
    if (form.descuento === true || form.descuento === "true") {

      console.log("entró")
      const totalConDescuento = (form.total * 0.9).toFixed(2);

      doc.font("Helvetica")
        .fontSize(11)
        .fillColor("green")
        .text("Descuento aplicado: 10%", rightX, y, { align: "center" });

      y += 15;

      doc.font("Helvetica-Bold")
        .fontSize(12)
        .fillColor("black")
        .text(`Total con descuento: $${totalConDescuento}`, rightX, y, { align: "center" });
    }

    y = y + 15;


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


    if (imagenes.length > 0) {
      doc.addPage();

      const margin = 40;
      const cols = 2;
      const rows = 2;
      const maxImagesPerPage = cols * rows;


      const pageWidth = doc.page.width - margin * 2;
      const pageHeight = doc.page.height - margin * 2;

      const cellWidth = pageWidth / cols;
      const cellHeight = pageHeight / rows;

      imagenes.forEach((file, index) => {
        if (index !== 0 && index % maxImagesPerPage === 0) {
          doc.addPage();
        }

        try {
          const image = doc.openImage(file.buffer);

          const imgAspect = image.width / image.height;

          let displayWidth = cellWidth * 0.9;
          let displayHeight = displayWidth / imgAspect;

          if (displayHeight > cellHeight * 0.9) {
            displayHeight = cellHeight * 0.9;
            displayWidth = displayHeight * imgAspect;
          }

          const currentCell = index % maxImagesPerPage;
          const col = currentCell % cols;
          const row = Math.floor(currentCell / cols);

          const x = margin + col * cellWidth + (cellWidth - displayWidth) / 2;
          const y = margin + row * cellHeight + (cellHeight - displayHeight) / 2;

          // Insertar imagen
          doc.image(file.buffer, x, y, {
            width: displayWidth,
            height: displayHeight,
          });

        } catch (err) {
          console.error("Error al insertar imagen:", err);
        }
      });
    }

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

app.post("/api/enviar-pdf-correo", async (req, res) => {

  console.log(req.body)
  try {
    const { folio, email } = req.body;

    if (!folio || !email) {
      return res.status(400).json({ error: "Folio y email son requeridos" });
    }

    // Buscar PDF en Mongo
    const ordenPDF = await OrdenPDF.findOne({ folio });

    if (!ordenPDF || !ordenPDF.pdf) {
      return res.status(404).json({ error: "PDF no encontrado" });
    }

    // Configurar envío con Gmail
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
      }
    });

    const mailOptions = {
      from: `"SERVIRRAPID" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `Orden de servicio ${folio}`,
      text: `Adjunto encontrarás la orden de servicio con folio ${folio}.`,
      attachments: [
        {
          filename: `orden-${folio}.pdf`,
          content: ordenPDF.pdf, // <--- buffer directo desde Mongo
          contentType: "application/pdf"
        }
      ]
    };

    await transporter.sendMail(mailOptions);

    res.json({ ok: true, message: "Correo enviado exitosamente" });

  } catch (error) {
    console.error("Error enviando correo:", error);
    res.status(500).json({ error: "Error enviando correo" });
  }
});
// Iniciar servidor
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
