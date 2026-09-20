FROM mcr.microsoft.com/dotnet/sdk:8.0-bookworm-slim AS build
WORKDIR /source
COPY PauseCut.csproj NuGet.Config ./
RUN dotnet restore PauseCut.csproj --configfile NuGet.Config
COPY . ./
RUN dotnet publish PauseCut.csproj -c Release --no-restore -o /published -p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /published ./
RUN mkdir -p /app/App_Data/jobs && chown -R app:app /app/App_Data
ENV ASPNETCORE_URLS=http://+:8080 ASPNETCORE_ENVIRONMENT=Production
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=15s --start-period=30s --retries=3 \
    CMD curl -fsS http://localhost:8080/api/health | grep -q '"ready":true' || exit 1
ENTRYPOINT ["dotnet", "PauseCut.dll"]
