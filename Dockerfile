# 使用 Ubuntu 作为运行时基础镜像
FROM ubuntu:24.04

# 1. 安装 locales 软件包并生成 UTF-8 语言包
RUN apt-get update && apt-get install -y \
    locales \
    bash \
    curl \
    wget \
    vim-tiny \
    iputils-ping \
    openjdk-21-jre-headless \
    && locale-gen en_US.UTF-8 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 2. 设置环境变量，确保系统和 Java 都使用 UTF-8
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

WORKDIR /app

# 从 GitHub Action 构建环境中拷贝编译好的 JAR
COPY komga/build/libs/komga-*.jar /app/komga.jar

EXPOSE 8080

# 3. 在启动参数中显式强制编码（双重保险）
ENTRYPOINT ["java", "-Dfile.encoding=UTF-8", "-Dsun.jnu.encoding=UTF-8", "-jar", "/app/komga.jar"]
