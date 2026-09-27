using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sanad.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddExternalLibrarySources : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "AudioStorageKey",
                table: "AudioTracks",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(300)",
                oldMaxLength: 300);

            migrationBuilder.AlterColumn<string>(
                name: "AudioContentType",
                table: "AudioTracks",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(50)",
                oldMaxLength: 50);

            migrationBuilder.AddColumn<string>(
                name: "MediaKind",
                table: "AudioTracks",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "StoredAudio"); // كل المقاطع القائمة ملفات مخزّنة

            migrationBuilder.AddColumn<string>(
                name: "SourceUrl",
                table: "AudioTracks",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "YouTubeVideoId",
                table: "AudioTracks",
                type: "character varying(11)",
                maxLength: 11,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_AudioTracks_SourceUrl",
                table: "AudioTracks",
                column: "SourceUrl");

            migrationBuilder.CreateIndex(
                name: "IX_AudioTracks_YouTubeVideoId",
                table: "AudioTracks",
                column: "YouTubeVideoId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AudioTracks_SourceUrl",
                table: "AudioTracks");

            migrationBuilder.DropIndex(
                name: "IX_AudioTracks_YouTubeVideoId",
                table: "AudioTracks");

            migrationBuilder.DropColumn(
                name: "MediaKind",
                table: "AudioTracks");

            migrationBuilder.DropColumn(
                name: "SourceUrl",
                table: "AudioTracks");

            migrationBuilder.DropColumn(
                name: "YouTubeVideoId",
                table: "AudioTracks");

            migrationBuilder.AlterColumn<string>(
                name: "AudioStorageKey",
                table: "AudioTracks",
                type: "character varying(300)",
                maxLength: 300,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "character varying(300)",
                oldMaxLength: 300,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "AudioContentType",
                table: "AudioTracks",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "character varying(50)",
                oldMaxLength: 50,
                oldNullable: true);
        }
    }
}
