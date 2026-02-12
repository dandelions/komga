# --- 第一阶段：前端构建 ---
FROM node:20-slim AS frontend-builder
WORKDIR /webui
COPY komga-webui/package*.json ./
RUN npm install
COPY komga-webui/ .
RUN npm run build

# --- 第二阶段：后端构建 ---
FROM eclipse-temurin:21-jdk-jammy AS backend-builder
WORKDIR /source
COPY . .
# 从前端阶段拷贝产物到 Spring Boot 资源目录
COPY --from=frontend-builder /webui/dist/ /source/komga/src/main/resources/static/
COPY --from=frontend-builder /webui/dist/index.html /source/komga/src/main/resources/templates/
# 编译 Jar 包
RUN ./gradlew :komga:bootJar --no-daemon

# --- 第三阶段：运行环境 ---
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
# 此时你拥有了 /bin/sh, /bin/bash 以及完整的 JRE 环境
COPY --from=backend-builder /source/komga/build/libs/komga-*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
