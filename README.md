# Lomax SA · Catálogo de productos (Evaluación TEMI I)

Sistema de registro y consulta de productos tecnológicos sobre servicios AWS emulados con **Floci**:

* RDS (PostgreSQL)
* DynamoDB
* S3
* Lambda
* ECR
* EKS

## Integrantes

| Nombre                        | Cuenta GitHub | Aportes principales |
| ----------------------------- | ------------- | ------------------- |
| Angel Fabricio Paredes Campos | (usuario)     | (completar)         |

## Arquitectura

```text
Navegador
    │
    ▼
Proxy nginx :8080
    │
    ├── / ──────► Frontend (React + nginx)
    │
    └── /api/* ─► Backend (Node/Express :3000)
                       │
                       ├──► RDS PostgreSQL
                       │    ├── categorías
                       │    └── productos
                       │         └── estado: PENDIENTE / PUBLICADO
                       │
                       ├──► DynamoDB
                       │    └── atributos variables e imagen por producto_id
                       │
                       ├──► S3
                       │    ├── lomax-originales
                       │    └── lomax-miniaturas
                       │
                       └──► Lambda
                            └── generar-miniatura
                                └── síncrona, máximo 300x300
```

Todo pasa por **Floci**:

http://localhost:4566

### Flujo de registro de productos

1. El producto se registra como **PENDIENTE** en RDS y DynamoDB.
2. Se sube la fotografía original a S3.
3. Lambda genera la miniatura.
4. El backend verifica que los atributos y la miniatura existan correctamente.
5. Si todas las validaciones son correctas, el producto pasa a **PUBLICADO**.
6. Si algún paso falla, el producto permanece en estado **PENDIENTE**.
7. El proceso puede reintentarse sin duplicar el producto.

```text
                 ┌──────────────────────┐
                 │ Registrar producto   │
                 └──────────┬───────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │    PENDIENTE  │
                    └───────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
          RDS + DB     Subir imagen      S3
                                      │
                                      ▼
                                   Lambda
                                      │
                                      ▼
                                  Miniatura
                                      │
                                      ▼
                            Validar atributos
                              y miniatura
                                      │
                          ┌───────────┴───────────┐
                          │                       │
                       Correcto                 Error
                          │                       │
                          ▼                       ▼
                    ┌───────────┐           PENDIENTE
                    │ PUBLICADO │           (reintentar)
                    └───────────┘
```

## Puertos

| Componente                       | Puerto        |
| -------------------------------- | ------------- |
| Floci (API) / consola web        | `4566 / 4500` |
| Proxy (entrada de usuarios)      | `8080`        |
| Backend (directo, pruebas)       | `3000`        |
| RDS (proxy de Floci)             | `7001`        |
| Registro ECR (respaldo de Floci) | `5100`        |

## Estructura del proyecto

```text
.
├── backend/                    # API
├── frontend/                   # React
├── proxy/                      # nginx
├── lambda/
│   └── generar-miniatura/
├── db/                         # Esquema de base de datos
├── seed/                       # Productos e imágenes
├── scripts/                    # Automatización y pruebas
├── k8s/                        # Manifiestos de Kubernetes
└── evidencias/
    ├── E2
    ├── E3
    ├── E4
    ├── E5
    ├── E6
    └── E7
```

## Cómo ejecutar

### Requisitos

* Docker Desktop
* PowerShell
* Node.js
* Git

### 1. Levantar los servicios

Desde la raíz del proyecto:

```powershell
docker compose up -d --build
```

Esto levanta:

* Floci
* Backend
* Frontend
* Proxy

### 2. Cargar las variables de entorno

```powershell
. .\scripts\env.ps1
```

> El espacio entre `.` y `.\scripts\env.ps1` es intencional: permite cargar las variables en la sesión actual de PowerShell.

### 3. Crear los servicios emulados

```powershell
.\scripts\crear-rds.ps1
.\scripts\crear-dynamodb.ps1
.\scripts\crear-s3.ps1
```

### 4. Crear el esquema y cargar los datos

```powershell
node scripts/sql.js -f db/schema.sql
node scripts/cargar-datos.js
```

### 5. Desplegar Lambda

```powershell
.\scripts\desplegar-lambda.ps1
```

### 6. Generar imágenes y cargar el catálogo

```powershell
node scripts/generar-imagenes.js
node scripts/cargar-catalogo.js
```

Este último proceso publica los **20 productos**.

### 7. Abrir la aplicación

Aplicación:

http://localhost:8080

Floci:

http://localhost:4566

## Verificaciones por etapa

| Etapa               | Comando / acción                                                                | Evidencia       |
| ------------------- | ------------------------------------------------------------------------------- | --------------- |
| **E2 RDS/DynamoDB** | `node scripts/pruebas/e2-restricciones.js` y `node scripts/pruebas/e2-cruce.js` | `evidencias/E2` |
| **E3 S3/Lambda**    | `.\scripts\pruebas\e3.ps1`                                                      | `evidencias/E3` |
| **E4 API**          | `node scripts/pruebas/e4-api.js`                                                | `evidencias/E4` |
| **E5 Frontend**     | Registrar producto, probar duplicado y producto inválido desde la interfaz      | `evidencias/E5` |
| **E6 ECR**          | `. .\scripts\publicar-ecr.ps1`                                                  | `evidencias/E6` |
| **E7 EKS**          | `. .\scripts\eks-desplegar.ps1`                                                 | `evidencias/E7` |

## Decisiones técnicas

### UUID fijos

Los productos utilizan **UUID fijos** durante la carga inicial.

Esto permite ejecutar nuevamente el proceso de carga sin generar productos duplicados.

### Miniaturas

Las miniaturas utilizan siempre formato **JPEG** y una clave determinística:

```text
miniaturas/<producto_id>.jpg
```

De esta manera, un reintento no crea objetos adicionales para el mismo producto.

### Registro ECR

Docker Desktop no resuelve correctamente los dominios `*.localhost`.

Por este motivo, las imágenes se empujan al registro de Floci utilizando:

```text
localhost:5100
```

### Identificación de instancias en EKS

El backend responde mediante el encabezado:

```text
X-Instance-Id
```

Este valor contiene el nombre del **Pod de EKS** que atendió la solicitud y permite evidenciar el balanceo entre instancias.

## Resumen del flujo

```text
┌─────────────┐
│  Navegador  │
└──────┬──────┘
       │ :8080
       ▼
┌─────────────┐
│    nginx    │
│    Proxy    │
└──────┬──────┘
       │
       ├──────────────► Frontend React
       │
       └── /api/* ────► Backend Node/Express
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
        PostgreSQL       DynamoDB             S3
             │                │                │
             │                │                ▼
             │                │             Imagen
             │                │                │
             │                │                ▼
             │                │             Lambda
             │                │                │
             └────────────────┴────────────────┘
                              │
                              ▼
                         PUBLICADO
```

---

## Tecnologías utilizadas

| Tecnología            | Uso                               |
| --------------------- | --------------------------------- |
| **React**             | Interfaz frontend                 |
| **nginx**             | Servidor frontend y proxy inverso |
| **Node.js / Express** | API backend                       |
| **PostgreSQL**        | Datos estructurados               |
| **DynamoDB**          | Atributos variables               |
| **S3**                | Almacenamiento de imágenes        |
| **Lambda**            | Generación de miniaturas          |
| **Docker**            | Contenedores                      |
| **ECR**               | Registro de imágenes              |
| **EKS**               | Orquestación y despliegue         |
| **Floci**             | Emulación local de servicios AWS  |
