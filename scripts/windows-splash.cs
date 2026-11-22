using System;
using System.Diagnostics;
using System.Drawing;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

internal sealed class StartupSplash : Form
{
    private static readonly Rectangle Track = new Rectangle(162, 224, 156, 3);
    private static readonly Rectangle Caption = new Rectangle(0, 235, 480, 24);
    private static readonly Color FillColor = Color.FromArgb(255, 228, 0);
    private readonly Stopwatch clock = Stopwatch.StartNew();
    private readonly Font captionFont = new Font("Microsoft YaHei UI", 9F);
    private readonly Bitmap artwork;
    private readonly bool animate;
    private bool unpacked;

    [DllImport("user32.dll")]
    private static extern bool SystemParametersInfo(uint action, uint param, out int value, uint flags);

    private StartupSplash(Bitmap artwork)
    {
        this.artwork = artwork;
        int animationsEnabled;
        const uint spiGetClientAreaAnimation = 0x1042;
        animate = !SystemParametersInfo(spiGetClientAreaAnimation, 0, out animationsEnabled, 0) || animationsEnabled != 0;
        Text = "PRTS Stronghold · 启动中";
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        ShowInTaskbar = false;
        AutoScaleMode = AutoScaleMode.None;
        ClientSize = artwork.Size;
        DoubleBuffered = true;
    }

    protected override bool ShowWithoutActivation { get { return true; } }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.DrawImage(artwork, ClientRectangle, 0, 0, artwork.Width, artwork.Height, GraphicsUnit.Pixel);
        using (var trackBrush = new SolidBrush(Color.FromArgb(63, 75, 85)))
        using (var fillBrush = new SolidBrush(FillColor))
        {
            e.Graphics.FillRectangle(trackBrush, Track);
            const int segment = 44;
            // Clip the segment as it enters and leaves the track. Elapsed time keeps the speed steady.
            int start = animate ? (int)(clock.ElapsedMilliseconds % 1400 * (Track.Width + segment) / 1400) - segment
                                : (Track.Width - segment) / 2;
            int left = Math.Max(0, start);
            int width = Math.Min(Track.Width, start + segment) - left;
            if (width > 0) e.Graphics.FillRectangle(fillBrush, Track.X + left, Track.Y, width, Track.Height);
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
            using (var launcher = Process.GetProcessById(launcherId))
            using (var done = EventWaitHandle.OpenExisting(events + "Done"))
            using (var extracted = EventWaitHandle.OpenExisting(events + "Unpacked"))
            using (var image = Assembly.GetExecutingAssembly().GetManifestResourceStream("PRTS.Startup"))
            using (var bitmap = new Bitmap(image))
            {
                if (launcher.HasExited || done.WaitOne(0)) return;
                Application.EnableVisualStyles();
                using (var splash = new StartupSplash(bitmap))
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
