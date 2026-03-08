defmodule HgsVideoStories.OpenAI.TimelineTranscriptionClient do
  @moduledoc false

  @callback transcribe_file(Path.t()) ::
              {:ok, %{segments: [map()], raw_response: map(), model: String.t()}}
              | {:error, atom(), String.t()}

  def transcribe_file(path) when is_binary(path) do
    api_key = get_config(:api_key)

    with true <- is_binary(api_key) and api_key != "",
         {:ok, %File.Stat{size: size_bytes}} <- File.stat(path),
         {:ok, response} <-
           Req.post(
             url: "#{get_config(:base_url)}/v1/audio/transcriptions",
             headers: [{"authorization", "Bearer #{api_key}"}],
             form_multipart: [
               {"file",
                {File.stream!(path, [], 64_000), filename: Path.basename(path), size: size_bytes}},
               {"model", get_config(:model)},
               {"response_format", "verbose_json"},
               {"timestamp_granularities[]", "segment"}
             ]
           ),
         {:ok, normalized} <- normalize_response(response) do
      {:ok, normalized}
    else
      false ->
        {:error, :missing_api_key, "OPENAI_API_KEY is not configured."}

      {:error, :enoent} ->
        {:error, :file_not_found, "Could not find uploaded media for timeline transcription."}

      {:error, %Req.TransportError{} = error} ->
        {:error, :transport_error, Exception.message(error)}

      {:error, reason, message} ->
        {:error, reason, message}
    end
  end

  defp normalize_response(%Req.Response{status: status, body: body}) when status in [200, 201] do
    segments =
      body
      |> Map.get("segments", [])
      |> Enum.map(&normalize_segment/1)
      |> Enum.reject(&is_nil/1)

    {:ok,
     %{
       segments: segments,
       raw_response: body,
       model: body["model"] || get_config(:model)
     }}
  end

  defp normalize_response(%Req.Response{status: status, body: body}) do
    message =
      cond do
        is_map(body) and is_binary(get_in(body, ["error", "message"])) ->
          get_in(body, ["error", "message"])

        is_map(body) and is_binary(body["message"]) ->
          body["message"]

        true ->
          "OpenAI timeline transcription request failed with status #{status}."
      end

    {:error, :upstream_error, message}
  end

  defp normalize_segment(%{"text" => text} = segment) when is_binary(text) and text != "" do
    %{
      text: text,
      start_ms: seconds_to_ms(segment["start"]),
      end_ms: seconds_to_ms(segment["end"])
    }
  end

  defp normalize_segment(_segment), do: nil

  defp seconds_to_ms(value) when is_number(value), do: round(value * 1000)
  defp seconds_to_ms(_value), do: 0

  defp get_config(key) do
    :hgs_video_stories
    |> Application.get_env(:openai_timeline, [])
    |> Keyword.get(key)
  end
end
