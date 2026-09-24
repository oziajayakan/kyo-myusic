package nimiyo.litedownloader;

import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ImageViewerActivity extends AppCompatActivity {

    public static final String EXTRA_FILE_PATH = "extra_file_path";
    public static final String EXTRA_URI = "extra_uri";
    public static final String EXTRA_TITLE = "extra_title";

    private ImageView nativeImageView;
    private ProgressBar loadingProgress;
    private LinearLayout topBarOverlay;
    private TextView tvImageTitle;
    private boolean areControlsVisible = true;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private Bitmap loadedBitmap = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_image_viewer);

        nativeImageView = findViewById(R.id.nativeImageView);
        loadingProgress = findViewById(R.id.imageLoadingProgress);
        topBarOverlay = findViewById(R.id.imageTopBarOverlay);
        tvImageTitle = findViewById(R.id.tvImageTitle);
        ImageButton btnBack = findViewById(R.id.btnImageBack);
        ImageButton btnShare = findViewById(R.id.btnImageShare);
        View rootContainer = findViewById(R.id.imageRootContainer);

        String filePath = getIntent().getStringExtra(EXTRA_FILE_PATH);
        String uriStr = getIntent().getStringExtra(EXTRA_URI);
        String title = getIntent().getStringExtra(EXTRA_TITLE);

        if (title != null && !title.trim().isEmpty()) {
            tvImageTitle.setText(title);
        } else if (filePath != null) {
            tvImageTitle.setText(new File(filePath).getName());
        } else {
            tvImageTitle.setText("NIMIYO Photo Viewer");
        }

        btnBack.setOnClickListener(v -> finish());
        if (btnShare != null) {
            btnShare.setOnClickListener(v -> shareCurrentImage());
        }

        rootContainer.setOnClickListener(v -> toggleControls());
        nativeImageView.setOnClickListener(v -> toggleControls());

        // Load image asynchronously
        loadImageAsync(filePath, uriStr);
    }

    private void loadImageAsync(String filePath, String uriStr) {
        loadingProgress.setVisibility(View.VISIBLE);

        executor.execute(() -> {
            Bitmap bmp = null;
            try {
                if (filePath != null) {
                    File file = new File(filePath);
                    if (file.exists()) {
                        bmp = decodeSampledBitmapFromFile(file.getAbsolutePath(), 2048, 2048);
                    }
                } else if (uriStr != null && !uriStr.isEmpty()) {
                    Uri uri = Uri.parse(uriStr);
                    try (InputStream is = getContentResolver().openInputStream(uri)) {
                        bmp = BitmapFactory.decodeStream(is);
                    }
                }
            } catch (Throwable t) {
                t.printStackTrace();
            }

            final Bitmap result = bmp;
            mainHandler.post(() -> {
                loadingProgress.setVisibility(View.GONE);
                if (result != null) {
                    loadedBitmap = result;
                    nativeImageView.setImageBitmap(result);
                } else {
                    Toast.makeText(ImageViewerActivity.this, "Gagal memuat berkas foto", Toast.LENGTH_SHORT).show();
                    finish();
                }
            });
        });
    }

    private Bitmap decodeSampledBitmapFromFile(String path, int reqWidth, int reqHeight) {
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(path, options);

        options.inSampleSize = calculateInSampleSize(options, reqWidth, reqHeight);
        options.inJustDecodeBounds = false;
        options.inPreferredConfig = Bitmap.Config.RGB_565; // memory efficient

        return BitmapFactory.decodeFile(path, options);
    }

    private int calculateInSampleSize(BitmapFactory.Options options, int reqWidth, int reqHeight) {
        final int height = options.outHeight;
        final int width = options.outWidth;
        int inSampleSize = 1;

        if (height > reqHeight || width > reqWidth) {
            final int halfHeight = height / 2;
            final int halfWidth = width / 2;
            while ((halfHeight / inSampleSize) >= reqHeight && (halfWidth / inSampleSize) >= reqWidth) {
                inSampleSize *= 2;
            }
        }
        return inSampleSize;
    }

    private void toggleControls() {
        if (areControlsVisible) {
            topBarOverlay.animate().alpha(0.0f).setDuration(200).withEndAction(() -> {
                topBarOverlay.setVisibility(View.GONE);
                areControlsVisible = false;
            }).start();
        } else {
            areControlsVisible = true;
            topBarOverlay.setVisibility(View.VISIBLE);
            topBarOverlay.animate().alpha(1.0f).setDuration(200).start();
        }
    }

    private void shareCurrentImage() {
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
                shareIntent.setType("image/*");
                shareIntent.putExtra(Intent.EXTRA_STREAM, shareUri);
                shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                String title = tvImageTitle.getText().toString();
                if (!title.isEmpty()) {
                    shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
                }
                startActivity(Intent.createChooser(shareIntent, "Bagikan Foto"));
            } else {
                Toast.makeText(this, "Berkas foto tidak ditemukan untuk dibagikan", Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            Toast.makeText(this, "Gagal membagikan foto: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        executor.shutdown();
        if (loadedBitmap != null && !loadedBitmap.isRecycled()) {
            loadedBitmap.recycle();
            loadedBitmap = null;
        }
    }
}
