# Reporte E4 - Verificación de la API

- Fecha: 2026-09-30T05:14:46.257Z
- API: http://localhost:3000
- Casos correctos: 23 de 23

| # | Caso | Petición | Esperado | HTTP | Verificación directa (RDS / DynamoDB / S3) | Resultado |
|---|------|----------|----------|------|--------------------------------------------|-----------|
| 1 | Listar categorías | GET /categorias | 200 | 200 | API=3 categorías; RDS=3; coinciden=true | OK |
| 2 | Crear producto válido | POST /productos | 201 | 201 | HTTP estado=PENDIENTE; RDS estado=PENDIENTE, código=E4-MUNNHWJY; DynamoDB atributos={"conexion":"USB","distribucion":"Español","retroiluminado":true}, estado_procesamiento=PENDIENTE | OK |
| 3 | Código duplicado | POST /productos (mismo código) | 409 | 409 | RDS filas con ese código=1; paso=rds; devuelve el producto_id existente=true | OK |
| 4 | Precio negativo | POST /productos (precio -5) | 400 | 400 | precio negativo; RDS filas creadas=0; paso=validacion; detalles=[{"campo":"precio","mensaje":"No puede ser negativo"}] | OK |
| 5 | Categoría inexistente | POST /productos (categoria_id 99999) | 400 | 400 | categoría inexistente; RDS filas creadas=0; paso=rds; detalles="productos_categoria_id_fkey" | OK |
| 6 | Campos obligatorios ausentes | POST /productos ({codigo}) | 400 | 400 | faltan campos; RDS filas creadas=0; paso=validacion; detalles=[{"campo":"nombre","mensaje":"Es obligatorio y debe ser un texto no vacío"},{"campo":"descripcion","mensaje":"Es obligatorio y debe ser un texto no vacío"},{"campo":"precio","mensaje":"Es obligatorio y debe ser numérico"},{"campo":"categoria_id","mensaje":"Es obligatorio y debe ser un entero positivo"},{"campo":"atributos","mensaje":"Es obligatorio y debe ser un objeto"}] | OK |
| 7 | Atributos vacíos | POST /productos (atributos {}) | 400 | 400 | atributos vacíos; RDS filas creadas=0; paso=validacion; detalles=[{"campo":"atributos","mensaje":"Debe incluir al menos un atributo"}] | OK |
| 8 | Detalle de producto pendiente | GET /productos/{id} | 200 | 200 | HTTP estado=PENDIENTE; RDS estado=PENDIENTE; atributos vía DynamoDB={"conexion":"USB","distribucion":"Español","retroiluminado":true} | OK |
| 9 | La lista solo trae publicados | GET /productos | 200 | 200 | HTTP devuelve 1; RDS publicados=1; el pendiente no aparece=true | OK |
| 10 | Producto inexistente | GET /productos/{uuid inexistente} | 404 | 404 | paso=rds | OK |
| 11 | Identificador mal formado | GET /productos/no-es-uuid | 400 | 400 | paso=validacion | OK |
| 12 | Imagen no disponible | GET /productos/{id}/imagen (sin imagen) | 404 | 404 | S3 miniaturas del producto=0 | OK |
| 13 | Reprocesar sin original | POST /productos/{id}/reprocesar | 409 | 409 | S3 originales del producto=0; paso=s3 | OK |
| 14 | Imagen con formato no permitido | POST /productos/{id}/imagen (texto renombrado .jpg) | 415 | 415 | RDS estado=PENDIENTE; S3 originales=0 | OK |
| 15 | Imagen de más de 5 MB | POST /productos/{id}/imagen (6 MB) | 413 | 413 | RDS estado=PENDIENTE; S3 originales=0 | OK |
| 16 | Publicar con imagen válida | POST /productos/{id}/imagen (JPEG 1200x800) | 200 | 200 | RDS estado=PUBLICADO; DynamoDB estado_procesamiento=LISTA, miniatura_key=miniaturas/93294858-05ca-4e73-8d68-9306aedbbccf.jpg; S3 original=true, miniatura=true (300x200) | OK |
| 17 | Obtener miniatura | GET /productos/{id}/imagen | 200 | 200 | Content-Type=image/jpeg; SHA-256 endpoint=99a35bc9ccc48648 / S3=99a35bc9ccc48648; idénticos=true; 5109 bytes | OK |
| 18 | Catálogo combina RDS + DynamoDB | GET /productos | 200 | 200 | aparece=true; atributos HTTP = DynamoDB: true; miniatura_key HTTP = DynamoDB: true | OK |
| 19 | Detalle de producto publicado | GET /productos/{id} | 200 | 200 | HTTP estado=PUBLICADO; RDS estado=PUBLICADO; instancia=b1d0c62948b6 | OK |
| 20 | Reprocesar (sin duplicar objetos) | POST /productos/{id}/reprocesar | 200 | 200 | S3 antes={"originales":["originales/93294858-05ca-4e73-8d68-9306aedbbccf.jpg"],"miniaturas":["miniaturas/93294858-05ca-4e73-8d68-9306aedbbccf.jpg"]}; después={"originales":["originales/93294858-05ca-4e73-8d68-9306aedbbccf.jpg"],"miniaturas":["miniaturas/93294858-05ca-4e73-8d68-9306aedbbccf.jpg"]}; sin objetos extra=true | OK |
| 21 | Repetir la carga de la misma imagen | POST /productos/{id}/imagen (repetida) | 200 | 200 | S3 originales=1, miniaturas=1; sin objetos extra=true | OK |
| 22 | Reemplazar JPEG por PNG | POST /productos/{id}/imagen (PNG) | 200 | 200 | S3 originales=["originales/93294858-05ca-4e73-8d68-9306aedbbccf.png"], miniaturas=["miniaturas/93294858-05ca-4e73-8d68-9306aedbbccf.jpg"]; DynamoDB imagen_original_key=originales/93294858-05ca-4e73-8d68-9306aedbbccf.png | OK |
| 23 | Limpieza del producto de prueba | (directo a RDS, DynamoDB y S3) | 20 | 20 | RDS productos tras la limpieza=20 | OK |