# 新服务器维护规范与 AI 接管提示词

> 适用服务器：`156.225.23.175`  
> 操作系统：Ubuntu 22.04 LTS  
> 用途：统一后续人工或 AI 的部署、变更、备份和排障方式，禁止不同维护者随意改变架构。

---

## 一、维护目标

本服务器采用“统一目录、Docker Compose 管理、Nginx 统一 Web 入口、B 端项目使用 HTTPS、其他应用使用 HTTP、业务容器不直接暴露端口”的方式维护。

所有后续维护必须优先保证：

1. 现有数据不丢失；
2. 现有目录和端口规则不被随意改变；
3. 每项服务都能通过 Compose 重建；
4. 业务容器的内部 HTTP 端口不能直接暴露到公网；
5. 所有外部 Web 访问统一经过 Nginx；B 端项目必须使用 HTTPS，其他应用统一使用 HTTP（如 Jenkins、Nacos、GitLab）；
6. 配置文件不得写入本文档或聊天中的明文密码、私钥、SMTP 授权码。

---

## 二、服务器存储结构

### 2.1 磁盘

- 系统盘约 30 GB，挂载到 `/`；
- 数据盘约 120 GB，挂载到 `/www`；
- 软件、容器数据和 containerd 数据实际存放在数据盘。

### 2.2 绑定挂载

服务器使用以下固定结构：

```text
/www/opt        -> /opt
/www/docker     -> /var/lib/docker
/www/containerd -> /var/lib/containerd
```

这些绑定关系写在 `/etc/fstab` 中。不得随意删除、修改或重复创建。

维护前可检查：

```bash
findmnt /opt /var/lib/docker /var/lib/containerd
df -hT / /opt /var/lib/docker
```

### 2.3 软件目录规则

所有自行部署的软件统一放在：

```text
/opt/<软件名>/
```

例如：

```text
/opt/gitlab/
/opt/mysql/
/opt/mongodb/
/opt/nginx/
/opt/windmill/
/opt/jobs/
```

禁止把业务软件散装到 `/root`、`/home`、`/usr/local` 或临时目录。

每个服务目录原则上应包含：

```text
/opt/<软件名>/docker-compose.yml
/opt/<软件名>/docker-compose.override.yml   # 本机定制项，按需使用
/opt/<软件名>/.env                          # 密钥和环境变量，权限必须为 600
/opt/<软件名>/config/ 或其他持久化目录
```

临时迁移文件只能放在 `/opt/migration`，任务完成并验证后再删除。

---

## 三、Docker 与 Compose 规范

### 3.1 唯一启动方式

自行部署的软件必须通过 Docker Compose 管理：

```bash
cd /opt/<软件名>
docker compose up -d
```

禁止长期使用单独的 `docker run` 启动业务容器。临时诊断容器除外，用完必须删除。

### 3.2 配置文件

- 基础配置写入 `docker-compose.yml`；
- 本机专属修改可写入 `docker-compose.override.yml`；
- 密码和授权信息写入 `.env`，权限设置为 `600`；
- 不得把密码直接写入维护文档、Git 仓库或截图；
- Compose 文件中的服务名应稳定，Nginx 通过服务名访问上游；
- 新部署应尽量固定镜像版本，不要无条件使用 `latest`；
- 已运行服务不得为了“更新”而擅自升级大版本。

### 3.3 网络

统一共享网络：

```text
app-network
```

需要被 Nginx反向代理的应用必须加入该网络：

```yaml
services:
  xxxapp:
    networks:
      - app-network

networks:
  app-network:
    external: true
```

应用可以同时保留自己的 Compose 默认网络，但与 Nginx 通信必须使用 `app-network`。

### 3.4 端口暴露规则

业务容器只声明内部端口，不直接发布到宿主机：

```yaml
services:
  xxxapp:
    expose:
      - "8080"
```

禁止：

```yaml
ports:
  - "8080:8080"
```

判断规则：

- `8080/tcp`：仅容器内部可用，符合要求；
- `0.0.0.0:8080->8080/tcp`：已暴露到公网，不符合要求；
- `127.0.0.1:3306->3306/tcp`：仅宿主机本地访问，可用于数据库等特殊场景；
- Web 应用公网端口只允许由 Nginx 容器发布。

---

## 四、Nginx 与 HTTP/HTTPS 统一规范

### 4.1 总体原则

公网访问和容器端口规则按“维护目标”执行；容器内的 Nginx 上游通信使用 HTTP。公网协议和端口按下表分配：

| 应用类型                         | 协议  | 公网端口分配              |
| -------------------------------- | ----- | ------------------------- |
| B 端项目                         | HTTPS | 从 `10000` 起依次递增 `+1` |
| 其他应用（含研发和运维工具）     | HTTP  | 从 `8080` 起依次递增 `+1`  |

补充约束：

- Jenkins、Nacos、GitLab 等工具应用属于“其他应用”，统一使用 HTTP；
- HTTPS 证书绑定 IP 或域名，不绑定端口；同一张有效证书可供多个 HTTPS 端口复用；
- 每个公网端口必须单独配置并按需开放，不得一次性监听或开放整个预留端口范围。

### 4.2 端口规划

端口分配规则：

| 协议  | 起始端口 | 后续端口                    | 适用范围 |
| ----- | -------- | --------------------------- | -------- |
| HTTPS | `10000`  | `10001`、`10002`、`10003`…… | B 端项目 |
| HTTP  | `8080`   | `8081`、`8082`、`8083`……   | 其他应用 |

两组端口分别独立计数。新增应用时，在对应协议的已用最大端口上增加 `1`；每个应用必须记录协议和端口，并且只发布实际使用的具体端口。

数据库端口不得按此规则公开。

### 4.3 HTTPS 证书位置

当前证书：

```text
/etc/letsencrypt/live/gitlab-ip/fullchain.pem
/etc/letsencrypt/live/gitlab-ip/privkey.pem
```

Nginx 容器只读挂载：

```text
/etc/letsencrypt -> /etc/letsencrypt:ro
```

公共证书片段：

```text
/opt/nginx/conf.d/shared-ip-ssl.inc
```

选择 HTTPS 的应用通过下面这行复用证书：

```nginx
include /etc/nginx/conf.d/shared-ip-ssl.inc;
```

不得复制私钥到各应用目录。选择 HTTP 的应用不引用该证书片段。

### 4.4 新 Web 应用接入模板

以下应用 Compose 配置同时适用于 HTTP 和 HTTPS。假设：

- Compose 服务名：`xxxapp`
- 容器内部 HTTP 端口：`8080`
- HTTPS 公网端口示例：`10000`
- HTTP 公网端口示例：`8080`

应用 Compose：

```yaml
services:
  xxxapp:
    expose:
      - "8080"
    networks:
      - app-network

networks:
  app-network:
    external: true
```

在 `/opt/nginx/docker-compose.yml` 的 Nginx 服务中增加实际分配的端口。HTTPS 示例：

```yaml
ports:
  - "10000:10000"
```

HTTP 示例使用 `"8080:8080"`。

#### 4.4.1 HTTPS 接入模板

B 端项目创建 `/opt/nginx/conf.d/xxxapp.conf`：

```nginx
server {
    listen 10000 ssl;
    listen [::]:10000 ssl;
    server_name 156.225.23.175;

    include /etc/nginx/conf.d/shared-ip-ssl.inc;

    client_max_body_size 100m;

    location / {
        proxy_pass http://xxxapp:8080;
        proxy_http_version 1.1;

        proxy_set_header Host $http_host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Port 10000;

        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_redirect off;
    }
}
```

#### 4.4.2 HTTP 接入模板

非 B 端项目应用创建 `/opt/nginx/conf.d/xxxapp.conf`：

```nginx
server {
    listen 8080;
    listen [::]:8080;
    server_name 156.225.23.175;

    client_max_body_size 100m;

    location / {
        proxy_pass http://xxxapp:8080;
        proxy_http_version 1.1;

        proxy_set_header Host $http_host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto http;
        proxy_set_header X-Forwarded-Port 8080;

        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_redirect off;
    }
}
```

如果应用不需要 WebSocket，可删除 `Upgrade` 和 `Connection` 两行。  
如果应用有专门的 WebSocket 路径，应按应用官方文档单独配置，不能盲目照搬。

### 4.5 新应用 HTTP/HTTPS 标准执行顺序

1. 先判断是否为 B 端项目：是则使用 HTTPS，否则使用 HTTP，并写入维护记录；
2. 确认新端口未占用；
3. 应用加入 `app-network`，且不发布内部端口；
4. 为 Nginx 增加一个具体宿主机端口映射；
5. 创建该应用独立的 `conf.d/<应用名>.conf`；HTTPS 应用引用公共证书片段，HTTP 应用不得误加 `ssl`；
6. 先检查 Compose 和 Nginx 配置；
7. 配置检查通过后才重建或重载 Nginx；
8. 从服务器本机和外部电脑分别验证所选协议；
9. 检查内部端口没有被发布；
10. 记录最终使用的协议和端口。

常用检查：

```bash
cd /opt/nginx
docker compose config --quiet
docker exec nginx nginx -t
docker compose up -d --force-recreate nginx
```

本机 HTTPS 验证模板：

```bash
curl -I --resolve 156.225.23.175:10000:127.0.0.1 \
  https://156.225.23.175:10000
```

本机 HTTP 验证模板：

```bash
curl -I http://127.0.0.1:8080
```

端口暴露验证：

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
ss -lntp
```

---

## 五、当前服务说明

### 5.1 GitLab

目录：

```text
/opt/gitlab/config
/opt/gitlab/logs
/opt/gitlab/data
```

外部地址：

```text
http://156.225.23.175:8080
```

关键规则：

- GitLab 的 `external_url` 必须使用 HTTP 并包含 `:8080`；
- GitLab 不直接发布宿主机端口；
- Nginx 对外发布 `8080`；
- 修改 GitLab 配置后使用 GitLab 自身的 reconfigure，再检查健康状态；
- GitLab 升级必须先做官方备份，并按官方升级路径逐版本升级，禁止跨大版本直接升级。

### 5.2 Windmill

目录：

```text
/opt/windmill
/opt/jobs
```

外部地址：

```text
http://156.225.23.175:8081
```

关键规则：

- Windmill Server 内部端口为 `8000`，不直接发布；
- Windmill Extra 的 WebSocket/网关内部端口为 `3000`，不直接发布；
- Nginx 对外发布 `8081`；
- `/ws`、`/ws_mp`、`/ws_debug` 按官方路径代理到 `windmill_extra:3000`；
- 其他请求代理到 `windmill_server:8000`；
- `/opt/jobs` 是计划供作业脚本使用的固定宿主机目录；
- Windmill 自带 PostgreSQL 是 Windmill 自身数据库，不与业务 MySQL 混用。

### 5.3 MySQL

目录：

```text
/opt/mysql/data
/opt/mysql/config
```

规则：

- MySQL需要保持启动；
- 仅绑定 `127.0.0.1` 或仅在 Docker 网络内使用；
- 禁止将 `3306` 暴露到 `0.0.0.0`；
- 修改、升级或迁移前必须先做逻辑备份和数据目录备份；
- 生产数据变更不得只依赖容器快照。

### 5.4 MongoDB

- 数据已经迁移；
- 当前业务暂时不用；
- 必须保持停止状态；
- 不得设置为自动启动；
- 不得删除 MongoDB 数据卷和迁移后的数据，除非用户明确授权。

### 5.5 Nginx

目录：

```text
/opt/nginx/docker-compose.yml
/opt/nginx/conf.d/
/opt/nginx/html/
```

规则：

- Nginx 是唯一公网 Web 入口；
- 每个应用使用独立的 `.conf` 文件；
- HTTPS 应用的公共 TLS 配置使用 `shared-ip-ssl.inc`；HTTP 应用不得引用 TLS 证书片段；
- 修改后必须先执行 `nginx -t`；
- 配置检查失败时禁止重启或重建 Nginx；
- 不得重新开放裸 `443`，除非用户明确改变端口规划；
- Certbot 续期可能需要公网 `80` 端口完成验证，但不代表业务必须长期提供 HTTP 页面。

---

## 六、配置变更标准流程

任何会改变服务状态的操作都按以下顺序执行。

### 6.1 变更前

1. 明确当前操作的是新服务器 `156.225.23.175`；
2. 查看磁盘、内存、容器和端口状态；
3. 查明服务实际使用的 Compose 文件、挂载目录、网络和端口；
4. 备份即将修改的配置文件；
5. 涉及数据时另外做应用级数据备份；
6. 记录回滚方法。

配置备份目录建议：

```text
/opt/backups/config/<日期时间>/<软件名>/
```

数据备份目录建议：

```text
/opt/backups/data/<日期时间>/<软件名>/
```

备份目录不得长期与业务数据混在同一服务目录中。

### 6.2 变更中

- 一次只改变一个明确目标；
- 不得顺手升级其他软件；
- 不得使用 `docker system prune -a`；
- 不得删除数据卷；
- 不得执行 `docker compose down -v`；
- 不得直接修改容器内部文件作为永久配置；
- 永久配置必须落在 `/opt/<软件名>` 的 Compose、环境文件或挂载目录；
- 命令执行位置和目标服务器必须清楚；
- 有风险或不可逆操作必须先说明影响并获得用户确认。

### 6.3 变更后

至少验证：

1. Compose 配置合法；
2. 容器状态正常；
3. 日志没有持续报错；
4. Nginx 配置测试通过；
5. 本机访问正常；
6. 外部浏览器通过所选 HTTP 或 HTTPS 协议访问正常；
7. 登录、读写、任务执行等核心功能正常；
8. 内部端口没有意外暴露；
9. 重启策略符合预期；
10. 将最终配置、端口和备份位置写入维护记录。

---

## 七、备份、升级与回滚原则

### 7.1 备份

至少备份以下内容：

- `/opt` 下的 Compose、`.env`、配置和持久化数据；
- `/etc/letsencrypt`；
- `/etc/fstab`；
- GitLab 官方备份；
- MySQL 逻辑备份；
- Windmill PostgreSQL 数据库备份；
- Docker 命名卷清单和关键卷数据。

`.env` 和私钥备份必须加密保存，不得上传公开仓库。

### 7.2 升级

升级前必须：

1. 阅读对应软件官方升级说明；
2. 固定当前和目标镜像版本；
3. 确认兼容的中间版本路径；
4. 做配置和数据备份；
5. 记录当前容器镜像 ID；
6. 在维护窗口执行；
7. 升级后执行功能验证。

禁止直接执行无审查的全量 `docker compose pull && up -d`。

### 7.3 回滚

回滚优先级：

1. 恢复修改前配置；
2. 恢复原镜像版本；
3. 恢复应用官方备份或数据库备份；
4. 必要时恢复持久化目录；
5. 回滚后重新验证端口、网络、登录和数据。

---

## 八、禁止事项

除非用户明确授权，否则任何维护者或 AI 都不得：

- 重装操作系统；
- 改变 `/opt`、Docker、containerd 的数据盘挂载结构；
- 把软件安装到新的随意目录；
- 将业务容器内部端口直接开放到公网；
- 批量开放 HTTPS 或 HTTP 预留端口范围；
- 公开 MySQL、MongoDB、PostgreSQL、Redis 等数据库端口；
- 删除 Docker 卷、业务数据、备份或证书；
- 使用 `docker compose down -v`；
- 使用 `docker system prune -a`；
- 擅自升级 GitLab、数据库或 Windmill；
- 修改 SSH 登录策略、防火墙或云安全组而不说明影响；
- 在输出中展示密码、Token、私钥、SMTP 授权码；
- 因为临时排障而留下永久的公网端口；
- 只修改容器内部文件而不更新宿主机持久化配置；
- 在未验证回滚能力时执行不可逆变更。

---

## 九、交给其他 AI 的维护提示词

将下面内容连同本文件交给新的 AI。新的 AI 在提出或执行任何服务器操作前，都必须先遵守此提示词。

```text
你正在维护我的 Ubuntu 22.04 服务器 156.225.23.175。请把
SERVER_MAINTENANCE_STANDARD.md 视为本服务器的最高优先级维护规范。

在给出任何命令前，必须先阅读并复述与你当前任务有关的目录、Docker
Compose、网络、端口、HTTPS、备份和禁止事项。不得抛开现有架构另起炉灶，
不得按你个人偏好改变目录或部署方式。

必须遵守以下硬性约束：

1. 所有自行部署的软件统一安装在 /opt/<软件名>。
2. 所有长期运行的软件必须由 docker-compose.yml 管理，禁止使用临时
   docker run 代替正式部署。
3. 软件的配置、数据和 .env 必须持久化；.env 权限为 600，任何输出不得
   显示密码、Token、私钥或 SMTP 授权码。
4. 需要被 Nginx 访问的容器必须加入外部网络 app-network。
5. 业务 Web 容器只使用 expose 声明内部端口，禁止用 ports 把内部 HTTP
   端口直接发布到公网。
6. Nginx 是唯一公网 Web 入口。B 端项目必须使用 HTTPS；其他应用统一使用
   HTTP，Jenkins、Nacos、GitLab 等研发或运维工具均归入此类，不得自行改用 HTTPS。
7. HTTPS 端口从 10000 起依次递增 +1；HTTP 端口从 8080 起依次递增 +1。
   两组端口独立计数，每个实际使用的端口必须单独配置，禁止开放整个端口范围。
8. 选择 HTTPS 的应用统一复用
   /opt/nginx/conf.d/shared-ip-ssl.inc；不得为每个端口复制私钥。选择 HTTP
   的应用不得误加 ssl 或引用 TLS 证书片段。
9. 每个应用使用独立的 /opt/nginx/conf.d/<应用名>.conf。新增应用时，
   同时给 Nginx Compose 增加对应的端口映射。
10. Nginx 配置修改后，必须先执行 Compose 配置检查和 nginx -t；只有
    两项都成功才允许重建或重载 Nginx。
11. GitLab、MySQL 和 Windmill 当前需要运行；MongoDB 当前必须保持停止。
12. 数据库端口不得暴露到 0.0.0.0。MySQL只能绑定本机或 Docker 内网。
13. 不得使用 docker compose down -v、docker system prune -a，不得删除
    Docker 卷、业务数据、证书或备份，除非我明确授权。
14. 不得擅自升级软件版本。升级前必须检查官方升级路径、备份数据、固定
    镜像版本并准备回滚方案。
15. 任何修改前先做只读检查，查明现状后再给出方案；不得猜测配置。
16. 修改前备份目标配置；涉及数据时另外做应用级备份。修改后验证容器
    状态、日志、端口、Nginx、外部访问和核心业务功能。
17. 永久配置必须写回 /opt 下的 Compose 或持久化配置文件，禁止仅在容器
    内临时修改。
18. 每次命令必须标明在哪台服务器、哪个目录执行。高风险或不可逆操作
    必须先解释影响并等待我确认。
19. 我偏好分步骤操作：需要根据返回结果判断的命令一次只给一组；不依赖
    返回结果的安全只读命令可以合并。
20. 如果我的临时要求与本规范冲突，你必须先指出冲突、风险和推荐做法，
    不要静默破坏现有规范。

开始任务时，先用只读命令确认：当前主机、磁盘挂载、相关 Compose 文件、
容器、网络、端口和即将修改的配置。然后给出最小变更方案、备份方案、
验证步骤和回滚方案。不要直接执行破坏性操作。
```

---

## 十、维护记录要求

每次重要变更后，应在本文件末尾或独立变更日志中记录：

```text
日期时间：
维护人或 AI：
变更目标：
修改文件：
旧端口/新端口：
旧协议/新协议：
备份位置：
执行结果：
验证结果：
回滚方式：
遗留问题：
```

维护纪要路径：

./server-maintenance-summary.md  与当前文件同一级

本地也应保存一份副本。服务器版本和本地版本发生差异时，应先对比后合并，
不得直接覆盖。
