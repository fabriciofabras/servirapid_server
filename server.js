/** ------------- IMPORTS (IGUAL QUE TU CÓDIGO) ------------- **/
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
import bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logoPath = path.resolve(__dirname, "public", "logo_servirrapid.png");
const logo = fs.readFileSync(logoPath);

dotenv.config();

const app = express();
app.use(
  cors({
    origin: [
      "https://servirapid.vercel.app",
      "http://localhost:5173"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);

app.options("*", cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const storage = multer.memoryStorage();
const upload = multer({ storage });


/** ---------- MONGOOSE CONNECTION (YA ESTABA BIEN) ---------- **/
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


/** ---------- ESQUEMA ORDENES (IGUAL QUE LO TENÍAS) ---------- **/
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


/** ---------- LOGIN (CORREGIDO SOLO 1 LÍNEA) ---------- **/
app.post('/login', async (req, res) => {

  const { usuario, password } = req.body;

  try {
    const user = await Usuarios.findOne({ usuario });  // ← ← CORREGIDO

    if (!user) {
      return res.status(404).json({ message: "El usuario no existe" });
    }

    let passwordMatch = false;

    if (user.password && user.password.startsWith("$2")) {
      passwordMatch = await bcrypt.compare(password, user.password);
    } else {
      passwordMatch = password === user.password;
    }

    if (!passwordMatch) {
      return res.status(200).json({ message: "El usuario y/o contraseña son incorrectos" });
    }

    if (user.mustChangePassword) {
      return res.status(200).json({
        message: "Debe cambiar su contraseña",
        userId: user._id,
        usuario: user.usuario,
        mustChangePassword: true,
        perfil: user.perfil
      });
    }

    return res.status(200).json({
      message: "El usuario ha sido logueado",
      perfil: user.perfil
    });

  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ message: "Error del servidor", error: error.message });
  }
});


/** ---------- RESTO DE TU CÓDIGO (PDF, ORDENES...) NO SE TOCÓ ---------- **/

/* ... TODO IGUAL ... */

/** ---------- START SERVER ---------- **/
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
