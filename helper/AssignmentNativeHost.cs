using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

internal static class AssignmentNativeHost
{
    private const int MaxMessageBytes = 1024 * 1024;
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    private static readonly string OutputDirectory = Path.GetFullPath(
        Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "assignment"));

    public static int Main()
    {
        Console.InputEncoding = Encoding.UTF8;
        Console.OutputEncoding = Encoding.UTF8;

        try
        {
            using (Stream input = Console.OpenStandardInput())
            using (Stream output = Console.OpenStandardOutput())
            {
                while (true)
                {
                    string message = ReadMessage(input);
                    if (message == null) return 0;
                    WriteMessage(output, Handle(message));
                }
            }
        }
        catch (Exception error)
        {
            try
            {
                using (Stream output = Console.OpenStandardOutput())
                    WriteMessage(output, Json.Serialize(new { ok = false, error = SafeError(error.Message) }));
            }
            catch { }
            return 1;
        }
    }

    private static string Handle(string json)
    {
        Dictionary<string, object> request = Json.DeserializeObject(json) as Dictionary<string, object>;
        if (request == null) throw new InvalidDataException("消息格式无效");

        string type = GetString(request, "type");
        Directory.CreateDirectory(OutputDirectory);
        if (type == "ping")
            return Json.Serialize(new { ok = true, outputDirectory = OutputDirectory });
        if (type != "save-assignment")
            throw new InvalidDataException("未知操作");

        string mode = GetString(request, "recordMode") == "link" ? "link" : "details";
        string detectedAt = GetString(request, "detectedAt");
        object rawItems;
        if (!request.TryGetValue("items", out rawItems) || !(rawItems is IEnumerable))
            throw new InvalidDataException("缺少作业列表");

        int saved = 0;
        foreach (object rawItem in (IEnumerable)rawItems)
        {
            Dictionary<string, object> item = rawItem as Dictionary<string, object>;
            if (item == null) continue;

            string courseName = mode == "link" ? "assignment" : GetString(item, "courseName");
            string title = mode == "link" ? "link" : GetString(item, "title");
            var record = new Dictionary<string, string>
            {
                { "recordMode", mode },
                { "detectedAt", detectedAt },
                { "courseName", mode == "link" ? "" : courseName },
                { "title", mode == "link" ? "" : title },
                { "details", mode == "link" ? "" : Limit(GetString(item, "details"), 1000) },
                { "dueText", mode == "link" ? "" : GetString(item, "dueText") },
                { "url", GetString(item, "url") }
            };

            string timestamp = DateTime.UtcNow.ToString("yyyyMMdd-HHmmssfff");
            string filename = timestamp + "_" + saved.ToString("D2") + "_" + SafeFilename(courseName, 40) + "_" + SafeFilename(title, 60) + ".json";
            string path = Path.Combine(OutputDirectory, filename);
            File.WriteAllText(path, Json.Serialize(record), new UTF8Encoding(false));
            saved++;
        }

        return Json.Serialize(new { ok = true, savedCount = saved, outputDirectory = OutputDirectory });
    }

    private static string ReadMessage(Stream input)
    {
        byte[] lengthBytes = new byte[4];
        int first = input.ReadByte();
        if (first < 0) return null;
        lengthBytes[0] = (byte)first;
        ReadExactly(input, lengthBytes, 1, 3);
        int length = BitConverter.ToInt32(lengthBytes, 0);
        if (length <= 0 || length > MaxMessageBytes) throw new InvalidDataException("消息长度无效");
        byte[] body = new byte[length];
        ReadExactly(input, body, 0, length);
        return Encoding.UTF8.GetString(body);
    }

    private static void WriteMessage(Stream output, string message)
    {
        byte[] body = Encoding.UTF8.GetBytes(message);
        byte[] length = BitConverter.GetBytes(body.Length);
        output.Write(length, 0, length.Length);
        output.Write(body, 0, body.Length);
        output.Flush();
    }

    private static void ReadExactly(Stream stream, byte[] buffer, int offset, int count)
    {
        while (count > 0)
        {
            int read = stream.Read(buffer, offset, count);
            if (read <= 0) throw new EndOfStreamException();
            offset += read;
            count -= read;
        }
    }

    private static string GetString(Dictionary<string, object> values, string key)
    {
        object value;
        return values.TryGetValue(key, out value) && value != null ? Convert.ToString(value) : "";
    }

    private static string SafeFilename(string value, int maxLength)
    {
        string result = string.IsNullOrWhiteSpace(value) ? "assignment" : value.Trim();
        foreach (char invalid in Path.GetInvalidFileNameChars()) result = result.Replace(invalid, '_');
        result = result.Replace("..", "_");
        return Limit(result, maxLength);
    }

    private static string Limit(string value, int maxLength)
    {
        if (string.IsNullOrEmpty(value)) return "";
        return value.Length <= maxLength ? value : value.Substring(0, maxLength);
    }

    private static string SafeError(string value)
    {
        return Limit((value ?? "辅助程序错误").Replace("\r", " ").Replace("\n", " "), 200);
    }
}
