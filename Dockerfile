# 使用 Ubuntu 作为运行时基础镜像
FROM ubuntu:24.04

# 安装 shell 工具系列
RUN apt-get update && apt-get install -y \
    bash \
    curl \
    wget \
    vim-tiny \
    iputils-ping \
    openjdk-21-jre-headless \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 设置环境变量
ENV LC_ALL=en_US.UTF-8
WORKDIR /app

# 从 GitHub Action 构建环境中拷贝编译好的 JAR
# Komga 编译后的 jar 通常位于 komga/build/libs/ 下
COPY komga/build/libs/komga-*.jar /app/komga.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/komga.jar"]
