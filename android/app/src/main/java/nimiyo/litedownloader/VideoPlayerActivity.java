package nimiyo.litedownloader;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.VideoView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
import java.io.File;
import java.util.Locale;

public class VideoPlayerActivity extends AppCompatActivity {

    public static final String EXTRA_FILE_PATH = "extra_file_path";
    public static final String EXTRA_URI = "extra_uri";
    public static final String EXTRA_TITLE = "extra_title";
    public static final String EXTRA_AUTO_PLAY = "extra_auto_play";
    public static final String EXTRA_AUTO_LOOP = "extra_auto_loop";

    private VideoView videoView;
    private ProgressBar loadingProgress;
    private LinearLayout topBarOverlay;
    private LinearLayout bottomControlsOverlay;
    private ImageButton btnPlayPause;
    private ImageButton btnFullscreen;
    private TextView tvCurrentTime;
    private TextView tvTotalDuration;
    private SeekBar videoSeekBar;
    private TextView tvVideoTitle;

    private boolean isUserSeeking = false;
    private boolean areControlsVisible = true;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable hideControlsRunnable = this::hideControls;

    private final Runnable updateProgressRunnable = new Runnable() {
        @Override
        public void run() {
            if (videoView != null && videoView.isPlaying() && !isUserSeeking) {
                int current = videoView.getCurrentPosition();
                videoSeekBar.setProgress(current);
                tvCurrentTime.setText(formatTime(current));
            }
            handler.postDelayed(this, 300);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_video_player);

        videoView = findViewById(R.id.nativeVideoView);
        loadingProgress = findViewById(R.id.videoLoadingProgress);
        topBarOverlay = findViewById(R.id.topBarOverlay);
        bottomControlsOverlay = findViewById(R.id.bottomControlsOverlay);
        btnPlayPause = findViewById(R.id.btnPlayPause);
        btnFullscreen = findViewById(R.id.btnFullscreen);
        tvCurrentTime = findViewById(R.id.tvCurrentTime);
        tvTotalDuration = findViewById(R.id.tvTotalDuration);
        videoSeekBar = findViewById(R.id.videoSeekBar);
        tvVideoTitle = findViewById(R.id.tvVideoTitle);
        ImageButton btnBack = findViewById(R.id.btnVideoBack);
        ImageButton btnShare = findViewById(R.id.btnVideoShare);
        View rootContainer = findViewById(R.id.videoRootContainer);

        String filePath = getIntent().getStringExtra(EXTRA_FILE_PATH);
        String uriStr = getIntent().getStringExtra(EXTRA_URI);
        String title = getIntent().getStringExtra(EXTRA_TITLE);

        if (title != null && !title.trim().isEmpty()) {
            tvVideoTitle.setText(title);
        } else if (filePath != null) {
            tvVideoTitle.setText(new File(filePath).getName());
        } else {
            tvVideoTitle.setText("NIMIYO Video Player");
        }

        btnBack.setOnClickListener(v -> finish());
        if (btnShare != null) {
            btnShare.setOnClickListener(v -> shareCurrentVideo());
        }

        rootContainer.setOnClickListener(v -> toggleControls());

        btnPlayPause.setOnClickListener(v -> togglePlayPause());

        btnFullscreen.setOnClickListener(v -> toggleOrientation());

        videoSeekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (fromUser) {
                    tvCurrentTime.setText(formatTime(progress));
                }
            }

            @Override
            public void onStartTrackingTouch(SeekBar seekBar) {
                isUserSeeking = true;
                handler.removeCallbacks(hideControlsRunnable);
            }

            @Override
            public void onStopTrackingTouch(SeekBar seekBar) {
                isUserSeeking = false;
                if (videoView != null) {
                    videoView.seekTo(seekBar.getProgress());
                }
                scheduleAutoHideControls();
            }
        });

        // Set Video Source via FileProvider Content URI
        try {
            Uri videoUri = getIntent().getData();
            if (videoUri == null && uriStr != null && !uriStr.isEmpty()) {
                try {
                    videoUri = Uri.parse(uriStr);
                } catch (Exception ignored) {}
            }

            if (videoUri == null && filePath != null) {
                File file = new File(filePath);
                if (file.exists()) {
                    try {
                        videoUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
                    } catch (Exception fpEx) {
                        videoUri = Uri.fromFile(file);
                    }
                }
            }

            if (videoUri != null) {
                videoView.setVideoURI(videoUri);
            } else {
                Toast.makeText(this, "Berkas video tidak ditemukan", Toast.LENGTH_SHORT).show();
                finish();
                return;
            }
        } catch (Exception e) {
            Toast.makeText(this, "Gagal memuat video: " + e.getMessage(), Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        boolean autoPlay = getIntent().getBooleanExtra(EXTRA_AUTO_PLAY, true);
        boolean autoLoop = getIntent().getBooleanExtra(EXTRA_AUTO_LOOP, true);

        videoView.setOnPreparedListener(mp -> {
            loadingProgress.setVisibility(View.GONE);
            int duration = videoView.getDuration();
            videoSeekBar.setMax(duration > 0 ? duration : 100);
            tvTotalDuration.setText(formatTime(duration));
            try {
                mp.setLooping(autoLoop);
            } catch (Exception ignored) {}

            if (autoPlay) {
                videoView.start();
                btnPlayPause.setImageResource(R.drawable.ic_video_pause);
                handler.post(updateProgressRunnable);
                scheduleAutoHideControls();
            } else {
                btnPlayPause.setImageResource(R.drawable.ic_video_play);
                showControls();
            }
        });

        videoView.setOnCompletionListener(mp -> {
            if (!autoLoop) {
                btnPlayPause.setImageResource(R.drawable.ic_video_play);
                videoSeekBar.setProgress(videoSeekBar.getMax());
                showControls();
            }
        });

        videoView.setOnErrorListener((mp, what, extra) -> {
            loadingProgress.setVisibility(View.GONE);
            openInExternalPlayer();
            return true;
        });

        updateFullscreenButtonIcon();
    }

    private void togglePlayPause() {
        if (videoView == null) return;
        if (videoView.isPlaying()) {
            videoView.pause();
            btnPlayPause.setImageResource(R.drawable.ic_video_play);
            showControls();
            handler.removeCallbacks(hideControlsRunnable);
        } else {
            videoView.start();
            btnPlayPause.setImageResource(R.drawable.ic_video_pause);
            scheduleAutoHideControls();
        }
    }

    private void toggleControls() {
        if (areControlsVisible) {
            hideControls();
        } else {
            showControls();
            scheduleAutoHideControls();
        }
    }

    private void showControls() {
        areControlsVisible = true;
        topBarOverlay.setVisibility(View.VISIBLE);
        bottomControlsOverlay.setVisibility(View.VISIBLE);
        topBarOverlay.animate().alpha(1.0f).setDuration(200).start();
        bottomControlsOverlay.animate().alpha(1.0f).setDuration(200).start();
    }

    private void hideControls() {
        if (!areControlsVisible) return;
        topBarOverlay.animate().alpha(0.0f).setDuration(250).withEndAction(() -> topBarOverlay.setVisibility(View.GONE)).start();
        bottomControlsOverlay.animate().alpha(0.0f).setDuration(250).withEndAction(() -> {
            bottomControlsOverlay.setVisibility(View.GONE);
            areControlsVisible = false;
        }).start();
    }

    private void scheduleAutoHideControls() {
        handler.removeCallbacks(hideControlsRunnable);
        handler.postDelayed(hideControlsRunnable, 3500);
    }

    private void toggleOrientation() {
        int currentOrientation = getResources().getConfiguration().orientation;
        if (currentOrientation == Configuration.ORIENTATION_LANDSCAPE) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        }
    }

    private void updateFullscreenButtonIcon() {
        int currentOrientation = getResources().getConfiguration().orientation;
        if (currentOrientation == Configuration.ORIENTATION_LANDSCAPE) {
            btnFullscreen.setImageResource(R.drawable.ic_video_fullscreen_exit);
        } else {
            btnFullscreen.setImageResource(R.drawable.ic_video_fullscreen);
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        updateFullscreenButtonIcon();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (videoView != null && videoView.isPlaying()) {
            videoView.pause();
            btnPlayPause.setImageResource(R.drawable.ic_video_play);
        }
        handler.removeCallbacks(updateProgressRunnable);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (videoView != null && !videoView.isPlaying() && videoView.getCurrentPosition() > 0) {
            handler.post(updateProgressRunnable);
        }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (videoView != null) {
            videoView.stopPlayback();
        }
        super.onDestroy();
    }

    private void shareCurrentVideo() {
        try {
            String filePath = getIntent().getStringExtra(EXTRA_FILE_PATH);
            String uriStr = getIntent().getStringExtra(EXTRA_URI);
            Uri shareUri = null;

            if (filePath != null) {
                File file = new File(filePath);
                if (file.exists()) {
                    shareUri = FileProvider.getUriForFile(
                        this,
                        getPackageName() + ".fileprovider",
                        file
                    );
                }
            }
            if (shareUri == null && uriStr != null && !uriStr.isEmpty()) {
                shareUri = Uri.parse(uriStr);
            }

            if (shareUri != null) {
                Intent shareIntent = new Intent(Intent.ACTION_SEND);
                shareIntent.setType("video/*");
                shareIntent.putExtra(Intent.EXTRA_STREAM, shareUri);
                shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                String title = tvVideoTitle.getText().toString();
                if (!title.isEmpty()) {
                    shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
                }
                startActivity(Intent.createChooser(shareIntent, "Bagikan Video"));
            } else {
                Toast.makeText(this, "Berkas video tidak ditemukan untuk dibagikan", Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            Toast.makeText(this, "Gagal membagikan video: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    private void openInExternalPlayer() {
        try {
            Uri videoUri = getIntent().getData();
            String uriStr = getIntent().getStringExtra(EXTRA_URI);
            String filePath = getIntent().getStringExtra(EXTRA_FILE_PATH);

            if (videoUri == null && uriStr != null && !uriStr.isEmpty()) {
                try {
                    videoUri = Uri.parse(uriStr);
                } catch (Exception ignored) {}
            }
            if (videoUri == null && filePath != null) {
                File file = new File(filePath);
                if (file.exists()) {
                    try {
                        videoUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
                    } catch (Exception fpEx) {
                        videoUri = Uri.fromFile(file);
                    }
                }
            }

            if (videoUri != null) {
                Intent extIntent = new Intent(Intent.ACTION_VIEW);
                extIntent.setDataAndType(videoUri, "video/*");
                extIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(Intent.createChooser(extIntent, "Buka video dengan"));
                finish();
                return;
            }
        } catch (Exception e) {
            Toast.makeText(this, "Gagal memutar video: " + e.getMessage(), Toast.LENGTH_SHORT).show();
            finish();
            return;
        }
        Toast.makeText(this, "Gagal memutar format video", Toast.LENGTH_SHORT).show();
        finish();
    }

    private String formatTime(int millis) {
        if (millis <= 0) return "00:00";
        int totalSeconds = millis / 1000;
        int seconds = totalSeconds % 60;
        int minutes = (totalSeconds / 60) % 60;
        int hours = totalSeconds / 3600;
        if (hours > 0) {
            return String.format(Locale.US, "%d:%02d:%02d", hours, minutes, seconds);
        }
        return String.format(Locale.US, "%02d:%02d", minutes, seconds);
    }
}
