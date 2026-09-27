# Assignment Reminder

一个面向 Moodle 类课程网站的 Edge / Chrome 扩展。扩展会定时检查课程页面中的“作业”章节，在发现新发布的作业时发送系统通知；按需还可以把作业记录导出为项目目录下的 JSON 文件。

## 功能

- 支持添加多门课程，每门课程使用独立网址和课程代号。
- 支持 `/course/view.php?id=430#section-3` 一类课程页面。
- 优先扫描网址指定的 `#section-3`，没有锚点时自动查找标题为“作业”“课程作业”“Homework”或“Assignments”的章节。
- 按 5 分钟、15 分钟、30 分钟、1 小时或 3 小时的间隔检查是否有新作业发布。
- 首次检查只显示已有作业数量，以后出现新作业时才通知。
- 默认启用隐私模式，系统通知不显示课程名和作业名。
- 可选择不保存详情、仅保存网址，或保存课程代号、作业内容、截止信息和网址。
- Windows 上可安装本地辅助程序，将新作业导出到 `<项目目录>\assignment`。

## 运行要求

- Edge 或 Chrome 116 及以上版本。
- 课程网站能够在浏览器中正常登录。
- 自动检查期间浏览器需要保持运行。
- 导出到项目目录的辅助程序目前仅配置了 Microsoft Edge。
- 安装辅助程序需要 Windows 自带的 .NET Framework 4.x C# 编译器。

## 一、安装浏览器扩展

### Edge

1. 下载或克隆本项目，并保留完整目录结构。
2. 在 Edge 右上角地址栏打开 “$\cdots$ -> 扩展 -> 管理扩展”。
3. 开启页面上的“开发人员模式”。
4. 点击“加载解压缩的扩展”。
5. 选择本项目根目录。
6. 点击 Edge 工具栏上的“扩展”按钮，找到“Assignment Reminder”，再点击“固定到工具栏”。
7. 点击工具栏上的扩展图标打开操作面板。

### Chrome

在 Chrome 地址栏打开 `chrome://extensions`，其余步骤与 Edge 相同。基础检查和浏览器本地记录功能可用；当前辅助程序安装脚本只注册到 Edge。

## 二、添加和检查课程

1. 登录课程网站。
2. 打开课程的作业章节，并复制地址栏中的完整网址，例如：

   ```text
   https://example.edu/course/view.php?id=000#section-3
   ```

3. 打开“Assignment Reminder”。
4. 填写“课程名”。
5. 粘贴完整网址并点击“授权并添加”。
6. 浏览器询问网站访问权限时，只会批准当前课程网站。
7. 点击“立即检查”。

首次检查会显示识别到的作业数量。以后页面出现新的作业时，扩展才会通知并按设置进行记录。

课程列表中的“打开”可以进入对应课程页面；“删除”会删除该课程配置和 Edge 内部的相关历史。如果同一网站不再有其他课程，扩展还会撤销该网站的访问权限。

## 三、提醒和记录设置

### 检查间隔

选择自动检查周期。Edge 完全退出后扩展无法继续检查；重新打开浏览器后会恢复。

### 通知隐私模式

“通知中隐藏课程名和作业名”默认开启。开启后系统通知只显示课程页面有更新，不在锁屏或通知中心暴露具体课程和作业内容。

### 保存新发布作业到本地

该选项默认关闭。

- 关闭：仍然检查和通知，但不保存新作业标题、说明、截止信息或具体作业网址。
- “仅作业网址”：保存网址、发现时间和课程名。
- “课程、内容和网址”：保存课程名、作业标题、课程页面上可见的说明文字、截止信息、网址和发现时间。

“本地记录”区域显示已经保存的记录。点击“清空”只会清除浏览器内部的作业历史，不会删除辅助程序已经导出的 JSON 文件。

## 四、安装本地导出辅助程序

浏览器扩展受安全沙箱限制，不能直接写入任意项目目录。辅助程序通过 Edge Native Messaging 接收扩展发送的新作业数据，并写入：

```text
<项目目录>\assignment\
```

它只在本机运行，不开放网络端口，也不会连接互联网。安装只修改当前 Windows 用户的 Edge Native Messaging 注册项，不需要管理员权限。

### 推荐安装方法

1. 双击项目根目录中的 `install-helper.cmd`。
2. 等待命令窗口显示：

   ```text
   Native helper installed successfully.
   ```

3. 打开扩展界面，在“Assignment Reminder”卡片上点击“重新加载”。
4. 打开扩展面板，先开启“保存新发布作业到本地”。
5. 开启“同时导出到项目 assignment 文件夹”。
6. Edge 询问“与本机应用通信”权限时选择允许。
7. 点击“测试辅助程序”。面板显示“辅助程序已连接”后安装完成。

### 使用 PowerShell 安装

在项目根目录打开 PowerShell，然后运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\helper\install.ps1"
```

安装脚本会执行以下操作：

1. 将 `helper/AssignmentNativeHost.cs` 编译为本机辅助程序；
2. 生成仅供本机使用的 `helper/com.local.assignment_reminder.json`；
3. 注册当前用户的 `com.local.assignment_reminder` Native Messaging 主机；
4. 创建 `<项目目录>\assignment` 输出目录；

### 移动项目后的处理

Native Messaging 主机清单包含辅助程序的绝对路径。如果项目被移动或重命名，必须在新目录中重新运行 `install-helper.cmd`，然后重新加载扩展。否则会出现：

```text
Specified native messaging host not found
```

### 导出文件格式

每项新作业生成一个 UTF-8 JSON 文件，例如：

```text
20260927-163000123_00_课程A_第一次作业.json
```

选择“课程、内容和网址”时，文件结构类似：

```json
{
  "recordMode": "details",
  "detectedAt": "2026-09-27T08:30:00.000Z",
  "courseName": "课程 A",
  "title": "第一次作业",
  "details": "完成第一章习题",
  "dueText": "2026-09-30 23:59",
  "url": "https://example.edu/mod/assign/view.php?id=100"
}
```

辅助程序仅保存课程页面当前可见的说明，不会自动进入每个作业详情页抓取额外内容。

## 五、数据保存位置

| 使用方式 | 保存位置 | 内容 |
| --- | --- | --- |
| 始终保存 | Edge 的 `chrome.storage.local` | 课程名、课程网址 |
| 开启浏览器本地记录 | Edge 的 `chrome.storage.local` | 根据记录模式保存新作业网址或完整记录 |
| 同时启用辅助程序 | `<项目目录>\assignment` | 每项新作业一个 JSON 文件，同时保留 Edge 内部记录 |
| 通知点击目标 | `chrome.storage.session` | 临时保存，浏览器会话结束后清除 |

Edge 中的底层文件通常位于：

```text
%LOCALAPPDATA%\Microsoft\Edge\User Data\<配置名称>\Local Extension Settings\<扩展ID>\
```

这是 Edge 管理的 LevelDB 数据，不是普通 JSON 文件，不建议直接编辑。

## 六、常见问题

### 无法连接辅助程序：Specified native messaging host not found

1. 在当前项目目录重新运行 `install-helper.cmd`。
2. 确认安装窗口显示成功信息。
3. 在扩展界面中重新加载扩展。
4. 再次点击“测试辅助程序”。
5. 如果错误仍存在，彻底退出 Edge 后重新打开。

项目移动、辅助程序没有安装，或注册信息仍指向旧目录时都会出现该错误。

### 安装脚本提示找不到 csc.exe

辅助程序需要 .NET Framework 4.x 的 C# 编译器。请在 Windows 功能中启用相应的 .NET Framework 组件，再重新运行安装程序。

### 扩展显示“需要登录”

请在安装扩展的同一个 Edge 用户配置中打开课程网站并重新登录，然后再次点击“立即检查”。

### 显示“未找到作业项”

确认粘贴的网址包含正确的章节锚点，例如 `#section-3`。

### 没有收到自动提醒

- 确认 Edge 没有完全退出。
- 检查 Windows 是否允许 Edge 发送通知。
- 确认课程状态不是“需要登录”或“检查失败”。

## 七、卸载

### 卸载辅助程序

双击项目根目录中的 `uninstall-helper.cmd`，或在 powershell 中运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\helper\uninstall.ps1"
```

卸载脚本只移除当前用户的 Native Messaging 注册项，不会删除 `assignment` 中已经导出的文件。

### 卸载扩展

在扩展中移除“本地作业提醒”。浏览器内部的扩展存储通常会随扩展删除，但辅助程序导出的 JSON 文件不会自动删除。

## 隐私与安全

- 不保存账号、密码或 Cookie。
- 不使用分析、遥测、云端数据库或第三方接口。
- 课程网址和作业内容只在本机处理。
- 默认通知不显示课程名和作业名。
- 网站权限在添加课程时按网站单独申请，不在安装时直接访问所有网站。
- 删除课程后，如果该网站没有其他课程，扩展会撤销网站访问权限。
- 辅助程序只接受固定扩展 ID 的 Native Messaging 请求。

## 开发与验证

若自己再开发，修改扩展代码后，在扩展管理页面点击“重新加载”。修改 `AssignmentNativeHost.cs` 或移动项目后，需要重新运行 `install-helper.cmd`。

仓库中的主要文件：

```text
manifest.json                   扩展清单
background.js                   定时检查、通知和本地记录
offscreen.js                    课程页面 DOM 解析
popup.html / popup.js           扩展操作界面
helper/AssignmentNativeHost.cs  本地 JSON 导出辅助程序源码
helper/install.ps1              编译并注册辅助程序
helper/uninstall.ps1            移除辅助程序注册
assignment/                     本地 JSON 导出目录
```

## License

本项目使用 [MIT License](LICENSE)。