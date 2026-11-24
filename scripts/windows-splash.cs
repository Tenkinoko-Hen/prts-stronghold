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
    private static readonly Rectangle Caption = new Rectangle(100, 236, 280, 24);
    private readonly Color fillColor;
    private readonly Color captionBg;
    private readonly Stopwatch clock = Stopwatch.StartNew();
    private readonly Font captionFont = new Font("Microsoft YaHei UI", 9F);
    private readonly Bitmap artwork;
    private readonly bool animate;
    private bool unpacked;

    [DllImport("user32.dll")]
    private static extern bool SystemParametersInfo(uint action, uint param, out int value, uint flags);

    private StartupSplash(Bitmap artwork, string title, Color accent)
    {
        this.artwork = artwork;
        this.fillColor = accent;
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
        TextRenderer.DrawText(e.Graphics, unpacked ? "正在打开主窗口…" : "正在解包应用…", captionFont, Caption,
            Color.FromArgb(195, 205, 215), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) captionFont.Dispose();
        base.Dispose(disposing);
    }

    [STAThread]
    private static void Main(string[] args)
    {
        int launcherId;
        if (args.Length != 1 || !int.TryParse(args[0], out launcherId)) return;
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
                if (launcher.HasExited || done.WaitOne(0)) return;
                Application.EnableVisualStyles();
                using (var splash = new StartupSplash(bitmap, title, accent))
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
                        if (splash.unpacked != opening) splash.Invalidate(Caption);
                        splash.unpacked = opening;
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
    }
}
