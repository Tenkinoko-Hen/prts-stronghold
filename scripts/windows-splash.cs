using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

internal sealed class StartupSplash : Form
{
    private static readonly Rectangle Track = new Rectangle(136, 224, 208, 3);
    private static readonly Rectangle Caption = new Rectangle(40, 236, 400, 24);
    private readonly Color fillColor;
    private readonly Color captionBg;
    private readonly Stopwatch clock = Stopwatch.StartNew();
    private readonly Font captionFont = new Font("Microsoft YaHei UI", 9F);
    private readonly Bitmap artwork;
    private readonly bool animate;
    private readonly Process launcher;
    private bool unpacked;
    private string lastCaption = "";

    [DllImport("user32.dll")]
    private static extern bool SystemParametersInfo(uint action, uint param, out int value, uint flags);

    private StartupSplash(Bitmap artwork, string title, Color accent, Process launcher)
    {
        this.artwork = artwork;
        this.fillColor = accent;
        this.launcher = launcher;
        this.captionBg = artwork.GetPixel(4, Math.Max(0, artwork.Height - 5));
        int animationsEnabled;
        const uint spiGetClientAreaAnimation = 0x1042;
        animate = !SystemParametersInfo(spiGetClientAreaAnimation, 0, out animationsEnabled, 0) || animationsEnabled != 0;
        Text = title;
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        ShowInTaskbar = false;
        AutoScaleMode = AutoScaleMode.None;
        ClientSize = artwork.Size;
        DoubleBuffered = true;
        KeyPreview = true;
    }

    private string CurrentCaption()
    {
        long sec = clock.ElapsedMilliseconds / 1000;
        if (unpacked)
        {
            return sec >= 12 ? "正在初始化主窗口…（按 Esc 隐藏）" : "正在打开主窗口…";
        }
        if (sec >= 25) return "首次解包耗时较长（" + sec + "s），请检查杀软拦截或按 Esc 取消";
        if (sec >= 5) return "正在首次解包应用… " + sec + "s（后续启动将秒开）";
        return "正在准备应用…";
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        if (e.KeyCode == Keys.Escape)
        {
            if (!unpacked)
            {
                try { if (launcher != null && !launcher.HasExited) launcher.Kill(); } catch { }
            }
            Close();
        }
    }

    private static void LoadMeta(out string title, out Color accent)
    {
        title = "PRTS Stronghold";
        accent = Color.FromArgb(255, 230, 0);
        try
        {
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("PRTS.SplashMeta"))
            {
                if (stream == null) return;
                using (var reader = new StreamReader(stream, Encoding.UTF8))
                {
                    string line1 = reader.ReadLine();
                    string line2 = reader.ReadLine();
                    if (!string.IsNullOrWhiteSpace(line1)) title = line1.Trim();
                    if (!string.IsNullOrWhiteSpace(line2)) accent = ColorTranslator.FromHtml(line2.Trim());
                }
            }
        }
        catch { /* Fall back to defaults if metadata resource is missing or invalid. */ }
    }

    protected override bool ShowWithoutActivation { get { return true; } }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.DrawImage(artwork, ClientRectangle, 0, 0, artwork.Width, artwork.Height, GraphicsUnit.Pixel);
        using (var trackBrush = new SolidBrush(Color.FromArgb(63, 75, 85)))
        using (var fillBrush = new SolidBrush(fillColor))
        {
            e.Graphics.FillRectangle(trackBrush, Track);
            const int segment = 44;
            int start = animate ? (int)(clock.ElapsedMilliseconds % 1400 * (Track.Width + segment) / 1400) - segment
                                : (Track.Width - segment) / 2;
            int left = Math.Max(0, start);
            int width = Math.Min(Track.Width, start + segment) - left;
            if (width > 0) e.Graphics.FillRectangle(fillBrush, Track.X + left, Track.Y, width, Track.Height);
        }
        using (var bgBrush = new SolidBrush(captionBg))
        {
            e.Graphics.FillRectangle(bgBrush, Caption);
        }
        string caption = CurrentCaption();
        lastCaption = caption;
        TextRenderer.DrawText(e.Graphics, caption, captionFont, Caption,
            Color.FromArgb(195, 205, 215), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) captionFont.Dispose();
        base.Dispose(disposing);
    }

    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length >= 4 && string.Equals(args[0], "--pick-storage", StringComparison.OrdinalIgnoreCase))
        {
            return RunStoragePicker(args[1], args[2], args[3], args.Length >= 5 ? args[4] : "");
        }
        int launcherId;
        if (args.Length != 1 || !int.TryParse(args[0], out launcherId)) return 0;
        string events = @"Local\PRTS.Stronghold.Splash." + launcherId + ".";
        try
        {
            string title;
            Color accent;
            LoadMeta(out title, out accent);
            using (var launcher = Process.GetProcessById(launcherId))
            using (var done = EventWaitHandle.OpenExisting(events + "Done"))
            using (var extracted = EventWaitHandle.OpenExisting(events + "Unpacked"))
            using (var image = Assembly.GetExecutingAssembly().GetManifestResourceStream("PRTS.Startup"))
            using (var bitmap = new Bitmap(image))
            {
                if (launcher.HasExited || done.WaitOne(0)) return 0;
                Application.EnableVisualStyles();
                using (var splash = new StartupSplash(bitmap, title, accent, launcher))
                using (var timer = new System.Windows.Forms.Timer { Interval = 30 })
                {
                    timer.Tick += delegate
                    {
                        if (done.WaitOne(0) || launcher.HasExited)
                        {
                            splash.Close();
                            return;
                        }
                        bool opening = extracted.WaitOne(0);
                        splash.unpacked = opening;
                        if (splash.CurrentCaption() != splash.lastCaption) splash.Invalidate(Caption);
                        if (splash.animate) splash.Invalidate(Track);
                    };
                    splash.unpacked = extracted.WaitOne(0);
                    timer.Start();
                    Application.Run(splash);
                }
            }
        }
        catch (ArgumentException) { /* The launcher exited before the splash could start. */ }
        catch (WaitHandleCannotBeOpenedException) { /* The launcher's events are already closed. */ }
        return 0;
    }

    private static string RecommendNonSystemDir(string exeDir)
    {
        try
        {
            DriveInfo best = null;
            foreach (var d in DriveInfo.GetDrives())
            {
                if (!d.IsReady || d.DriveType != DriveType.Fixed) continue;
                if (d.Name.StartsWith("C:", StringComparison.OrdinalIgnoreCase)) continue;
                if (best == null || d.AvailableFreeSpace > best.AvailableFreeSpace)
                {
                    best = d;
                }
            }
            if (best != null)
            {
                return Path.Combine(best.RootDirectory.FullName, "PRTS-Stronghold-Data");
            }
        }
        catch { }
        return Path.Combine(exeDir, "PRTS-Data");
    }

    private static string DescribeDriveSpace(string dirPath)
    {
        try
        {
            string root = Path.GetPathRoot(Path.GetFullPath(dirPath));
            if (!string.IsNullOrEmpty(root))
            {
                var drive = new DriveInfo(root);
                if (drive.IsReady)
                {
                    double gb = drive.AvailableFreeSpace / (1024.0 * 1024.0 * 1024.0);
                    string tag = root.StartsWith("C:", StringComparison.OrdinalIgnoreCase) ? "（系统盘）" : "（非 C 盘 · 推荐）";
                    return string.Format("目标磁盘 {0} 可用空间：{1:F1} GB {2}", root.TrimEnd('\\'), gb, tag);
                }
            }
        }
        catch { }
        return "请选择可写入的本地磁盘目录";
    }

    private static int RunStoragePicker(string outFile, string productTitle, string exeDir, string reason)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        string title;
        Color accent;
        LoadMeta(out title, out accent);
        if (!string.IsNullOrWhiteSpace(productTitle)) title = productTitle.Trim();
        string recommended = RecommendNonSystemDir(exeDir);
        string chosen = null;

        using (var form = new Form())
        {
            form.Text = title + " · 首次启动存储路径设置";
            form.ClientSize = new Size(560, 268);
            form.FormBorderStyle = FormBorderStyle.FixedDialog;
            form.MaximizeBox = false;
            form.MinimizeBox = false;
            form.StartPosition = FormStartPosition.CenterScreen;
            form.BackColor = Color.FromArgb(14, 19, 28);
            form.ForeColor = Color.FromArgb(230, 236, 245);
            form.Font = new Font("Microsoft YaHei UI", 9.5F);
            form.TopMost = true;

            var topBar = new Panel { Dock = DockStyle.Top, Height = 4, BackColor = accent };
            var heading = new Label
            {
                Left = 22, Top = 18, Width = 516, Height = 26,
                Font = new Font("Microsoft YaHei UI", 12F, FontStyle.Bold),
                ForeColor = Color.White,
                Text = string.Equals(reason, "missing", StringComparison.OrdinalIgnoreCase)
                    ? "原数据目录不可用，请重新选择存储位置"
                    : "检测到程序位于 C 盘，建议指定非 C 盘数据目录",
            };
            var desc = new Label
            {
                Left = 22, Top = 48, Width = 516, Height = 44,
                ForeColor = Color.FromArgb(160, 174, 192),
                Text = "首次运行需释放约 500 MB 运行缓存，并用于保存热更新、历史战报与本地电台 BGM。\r\n后续替换新版 EXE 时将自动继承此处设置的路径，不会重复询问。",
            };
            var pathBox = new TextBox
            {
                Left = 22, Top = 104, Width = 414, Height = 28,
                BackColor = Color.FromArgb(22, 30, 44),
                ForeColor = Color.White,
                BorderStyle = BorderStyle.FixedSingle,
                Text = recommended,
            };
            var browseBtn = new Button
            {
                Left = 444, Top = 102, Width = 94, Height = 28,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(30, 41, 59),
                ForeColor = Color.White,
                Text = "浏览目录…",
            };
            browseBtn.FlatAppearance.BorderColor = Color.FromArgb(71, 85, 105);

            var spaceLabel = new Label
            {
                Left = 22, Top = 140, Width = 516, Height = 22,
                ForeColor = Color.FromArgb(103, 232, 249),
                Text = DescribeDriveSpace(recommended),
            };
            var warnLabel = new Label
            {
                Left = 22, Top = 166, Width = 516, Height = 24,
                ForeColor = Color.FromArgb(252, 165, 165),
                Text = "",
            };

            pathBox.TextChanged += delegate
            {
                spaceLabel.Text = DescribeDriveSpace(pathBox.Text.Trim());
                warnLabel.Text = "";
            };

            browseBtn.Click += delegate
            {
                using (var dlg = new FolderBrowserDialog())
                {
                    dlg.Description = "选择 PRTS 数据存储根目录（建议 D / E / J 等非 C 盘）";
                    dlg.ShowNewFolderButton = true;
                    if (Directory.Exists(pathBox.Text.Trim())) dlg.SelectedPath = pathBox.Text.Trim();
                    if (dlg.ShowDialog(form) == DialogResult.OK && !string.IsNullOrWhiteSpace(dlg.SelectedPath))
                    {
                        string picked = dlg.SelectedPath.Trim();
                        if (picked.Length <= 3) picked = Path.Combine(picked, "PRTS-Stronghold-Data");
                        pathBox.Text = picked;
                    }
                }
            };

            var okBtn = new Button
            {
                Left = 22, Top = 208, Width = 176, Height = 36,
                FlatStyle = FlatStyle.Flat,
                BackColor = accent,
                ForeColor = Color.FromArgb(11, 13, 17),
                Font = new Font("Microsoft YaHei UI", 9.5F, FontStyle.Bold),
                Text = "确认使用此目录",
            };
            okBtn.FlatAppearance.BorderSize = 0;

            var stayBtn = new Button
            {
                Left = 210, Top = 208, Width = 188, Height = 36,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(24, 34, 48),
                ForeColor = Color.FromArgb(203, 213, 225),
                Text = "仍放当前 C 盘目录",
            };
            stayBtn.FlatAppearance.BorderColor = Color.FromArgb(51, 65, 85);

            var cancelBtn = new Button
            {
                Left = 444, Top = 208, Width = 94, Height = 36,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(20, 26, 36),
                ForeColor = Color.FromArgb(148, 163, 184),
                Text = "退出",
            };
            cancelBtn.FlatAppearance.BorderColor = Color.FromArgb(51, 65, 85);

            Action<string> acceptPath = delegate(string candidate)
            {
                string trimmed = (candidate ?? "").Trim();
                if (string.IsNullOrEmpty(trimmed) || trimmed.Length <= 3)
                {
                    warnLabel.Text = "不能直接选择磁盘根目录，请指定一个子文件夹（例如 D:\\PRTS-Stronghold-Data）。";
                    return;
                }
                try
                {
                    Directory.CreateDirectory(trimmed);
                    string probe = Path.Combine(trimmed, ".prts-probe-" + Process.GetCurrentProcess().Id);
                    File.WriteAllText(probe, "ok");
                    File.Delete(probe);
                    chosen = Path.GetFullPath(trimmed);
                    form.DialogResult = DialogResult.OK;
                    form.Close();
                }
                catch (Exception ex)
                {
                    warnLabel.Text = "目录不可写，请更换其他路径：" + ex.Message;
                }
            };

            okBtn.Click += delegate { acceptPath(pathBox.Text); };
            stayBtn.Click += delegate { acceptPath(Path.Combine(exeDir, "PRTS-Data")); };
            cancelBtn.Click += delegate { form.DialogResult = DialogResult.Cancel; form.Close(); };

            form.Controls.AddRange(new Control[] { topBar, heading, desc, pathBox, browseBtn, spaceLabel, warnLabel, okBtn, stayBtn, cancelBtn });
            form.AcceptButton = okBtn;
            form.CancelButton = cancelBtn;

            if (form.ShowDialog() != DialogResult.OK || string.IsNullOrEmpty(chosen))
            {
                return 2;
            }
        }

        try
        {
            File.WriteAllText(outFile, chosen, new UTF8Encoding(false));
            return 0;
        }
        catch
        {
            return 2;
        }
    }
}
